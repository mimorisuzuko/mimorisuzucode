/// <reference path="typings/index.d.ts" />

const nodepath = require('path');
const fs = require('fs');
const co = require('co');
const qs = require('querystring');
const _ = require('lodash');
const electron = require('electron');
const { app, BrowserWindow, shell, ipcMain, Menu, dialog} = electron;
const Twitter = require('twitter');
const TwitterAPI = require('node-twitter-api');

const config = require('./config.json');
const tapi = new TwitterAPI({
    consumerKey: config.consumerKey,
    consumerSecret: config.consumerSecret,
    callback: 'https://www.google.co.jp/',
});
const IGNORED_FILES = ['.DS_Store'];
const template = require('./menu');
const dst = `file://${__dirname}/dst/index.html`;

let twitter = null;
let twitterSettings = {};

/**
 * Create the window
 * @param {Boolean} hasVerified
 * @returns {Promise}
 */
const createWindow = (hasVerified) => {
	const size = electron.screen.getPrimaryDisplay().workAreaSize;
	const mainWindow = new BrowserWindow({
		width: size.width, height: size.height,
		webPreferences: { webSecurity: false }
	});

	return new Promise((resolve, reject) => {
		if (hasVerified) {
			resolve({ mainWindow });
		} else {
			tapi.getRequestToken((err, requestToken, requestTokenSecret, results) => {
				if (err) { reject(err); }

				const aurl = tapi.getAuthUrl(requestToken);
				mainWindow.webContents.on('will-navigate', (event, url) => {
					event.preventDefault();
					const oauthVerifier = qs.parse(_.split(url, '?')[1]).oauth_verifier;
					tapi.getAccessToken(requestToken, requestTokenSecret, oauthVerifier, (err, accessToken, accessTokenSecret, results) => {
						if (err) { reject(err); }

						tapi.verifyCredentials(accessToken, accessTokenSecret, {}, (error, data, res) => {
							if (err) { reject(err); }
							resolve({ accessToken, accessTokenSecret, mainWindow });
						});
					});
				});
				mainWindow.loadURL(aurl);
			});
		}
	});
};

app.on('ready', () => {
	co(function* () {
		const {accessToken, accessTokenSecret, mainWindow} = yield createWindow();

		twitter = new Twitter({
			consumer_key: config.consumerKey,
			consumer_secret: config.consumerSecret,
			access_token_key: accessToken,
			access_token_secret: accessTokenSecret
		});

		const screenName = yield new Promise((resolve, reject) => {
			twitter.get('account/settings', (err, settings, res) => {
				if (err) { reject(err); }
				resolve(settings.screen_name);
			});
		});

		const {iconURL, name} = yield new Promise((resolve, reject) => {
			twitter.get('users/show', { screen_name: screenName }, (err, show, res) => {
				if (err) { reject(err); }
				const {profile_image_url, name} = show;
				const iconURL = profile_image_url.replace(/_normal/, '');
				resolve({ iconURL, name });
			});
		});

		twitterSettings = { iconURL, name, screenName };
		mainWindow.loadURL(dst);

		const menu = Menu.buildFromTemplate(template);
		Menu.setApplicationMenu(menu);
	}).catch((err) => { throw new Error(err); });
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') { app.quit(); }
});

app.on('activate', () => {
	if (BrowserWindow.getFocusedWindow()) { return; }
	co(function* () {
		const {mainWindow} = yield createWindow(true);
		mainWindow.loadURL(dst);
	});
});

/**
 * Dig a directory. Ignore a directory whose name start with a dot.
 * @param {String} dirpath
 * @returns {{directories: String[], files: []}}
 */
const digDirectory = (dirpath) => {
	const results = {
		directories: [],
		files: []
	};

	_.forEach(fs.readdirSync(dirpath), (basename) => {
		const dot = basename.charAt(0) === '.';
		const path = nodepath.join(dirpath, basename);
		const state = fs.statSync(path);
		if (state.isDirectory() && !dot) {
			results.directories.push(path);
		} else if (state.isFile() && !_.includes(IGNORED_FILES, basename)) {
			results.files.push(path);
		} else {
			console.log(`TODO: others path ${path}`);
		}
	});
	return results;
};

ipcMain.on('open', (event, args) => {
	const current = args.path;
	const basename = nodepath.basename(current);
	const basestate = fs.statSync(current);

	if (basestate.isDirectory()) {
		event.returnValue = {
			type: 'directory',
			results: digDirectory(current),
			basename
		};
	} else if (basestate.isFile()) {
		event.returnValue = {
			type: 'file',
			results: [current],
			basename
		};
	} else {
		console.log('TODO: others path');
	}
});

ipcMain.on('dig-directory', (event, args) => {
	event.returnValue = digDirectory(args.path);
});

ipcMain.on('dirs', (event, args) => {
	event.returnValue = fs.readdirSync(args.path);
});

ipcMain.on('read-file', (event, args) => {
	event.returnValue = fs.readFileSync(args.path, 'utf-8');
});

ipcMain.on('save-file', (event, args) => {
	fs.writeFileSync(args.path, args.data);
	event.returnValue = null;
});

ipcMain.on('message-box-save-or-not', (event, args) => {
	event.returnValue = dialog.showMessageBox(BrowserWindow.getFocusedWindow(),
		{
			type: 'info',
			buttons: ['Save', 'Cancel', 'Don\'t Save'],
			message: `Do you want to save the chnages you made to ${args.filename}?`,
			detail: 'Your changes will be lost if you don\'t save them.'
		}
	);
});

ipcMain.on('twitter-settings', (event, args) => {
	event.returnValue = twitterSettings;
});

ipcMain.on('tweet', (event, args) => {
	co(function* () {
		const result = yield new Promise((resolve, reject) => {
			twitter.post('statuses/update', { status: args.status }, (err, tweet, res) => {
				if (err) {
					resolve({
						type: 'error',
						content: err[0]
					});
				}
				resolve({
					type: 'success',
					content: 'Your message has been sent.'
				});
			});
		});
		event.returnValue = result;
	});
});