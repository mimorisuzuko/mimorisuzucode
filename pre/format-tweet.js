/// <reference path="../typings/index.d.ts" />

const _ = require('lodash');
const fs = require('fs');
const m = require('@mimorisuzuko/m');
const tweets = require('./tweets.json');

const json = [];

_.forEach(_.slice(tweets, 0), (tweet) => {
	_.forEach(m.parse(m.trim(tweet)), (a) => json.push(a));
});

fs.writeFileSync('../fomatedtweets.json', JSON.stringify(_.uniq(json), null, '\t'));