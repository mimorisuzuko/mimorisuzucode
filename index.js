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
const tkeys = fs.existsSync('twitter-keys.json') ? require('./twitter-keys.json') : {};
const dst = `file://${__dirname}/dst/index.html`;
const twitterSettings = {};

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

/**
 * Get id, screen name, icon url and name from Twitter account/verify_credentials. 
 * @param {Twitter} twitter
 * @returns {Promise}
 */
const getTwitterSettings = (twitter) => new Promise((resolve, reject) => {
	twitter.get('account/verify_credentials', (err, d) => {
		if (err) { reject(err); }

		const id = d.id_str;
		const screenName = d.screen_name;
		const iconURL = d.profile_image_url.replace(/_normal/, '');
		const name = d.name;

		resolve({ id, screenName, iconURL, name });
	});
});

app.on('ready', () => {
	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);

	co(function* () {
		const pairs = _.toPairs(tkeys);
		const pairsLength = pairs.length;
		if (pairsLength) {
			for (let i = 0; i < pairsLength; i += 1) {
				const [id, {accessToken, accessTokenSecret}] = pairs[i];
				const twitter = new Twitter({
					consumer_key: config.consumerKey,
					consumer_secret: config.consumerSecret,
					access_token_key: accessToken,
					access_token_secret: accessTokenSecret
				});
				const {iconURL, name, screenName} = yield getTwitterSettings(twitter);
				twitterSettings[id] = {
					iconURL,
					name,
					screenName,
					twitter
				};
			}

			const {mainWindow} = yield createWindow(true);
			mainWindow.loadURL(dst);
		} else {
			const {accessToken, accessTokenSecret, mainWindow} = yield createWindow();

			const twitter = new Twitter({
				consumer_key: config.consumerKey,
				consumer_secret: config.consumerSecret,
				access_token_key: accessToken,
				access_token_secret: accessTokenSecret
			});

			const {id, screenName, iconURL, name} = yield getTwitterSettings(twitter);

			tkeys[id] = { accessToken, accessTokenSecret };
			fs.writeFileSync('twitter-keys.json', JSON.stringify(tkeys, null, '\t'));

			twitterSettings[id] = {
				iconURL,
				name,
				screenName,
				twitter
			};

			mainWindow.loadURL(dst);
		}
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