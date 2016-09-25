/// <reference path="../typings/index.d.ts" />

const Twitter = require('twitter');
const co = require('co');
const _ = require('lodash');
const fs = require('fs');
const config = require('../config.json');

const twitter = new Twitter({
	consumer_key: config.consumerKey,
	consumer_secret: config.consumerSecret,
	access_token_key: config.accessToken,
	access_token_secret: config.accessTokenSecret
});

const getUserTimeline = (option) => {
	return new Promise((resolve, reject) => {
		twitter.get('statuses/user_timeline', option, (err, tweets, res) => {
			if (err) { reject(err); }
			resolve(tweets);
		});
	});
};

const option = {
	screen_name: 'mimori_suzuko',
	count: 200
};

const json = [];

co(function* () {
	while (true) {
		const tweets = yield getUserTimeline(option);
		if (tweets.length === 0) { break; }
		_.forEach(tweets, (tweet) => {
			option.max_id = tweet.id_str;
			if (_.includes(json, tweet.text) || tweet.hasOwnProperty('retweeted_status') || !tweet.entities.hasOwnProperty('media')) { return; }
			json.push(tweet.text);
		});
	}
	fs.writeFileSync('tweets.json', JSON.stringify(json, null, '\t'));
}).catch((err) => console.log(err));