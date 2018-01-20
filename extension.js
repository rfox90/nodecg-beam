'use strict';
const Channel = require('./lib/Channel.js');
const LiveLoading = require('./lib/Live.js');
const channelCache = {};

const toArray = require('object-values-to-array');

const SUBSCRIPTION = 'subscription';
const FOLLOW = 'follow';
const HOST = 'host';

module.exports = function (extensionApi) {
	const nodecg = extensionApi;
	const live = new LiveLoading(nodecg);
	if (!nodecg.bundleConfig || !Object.keys(nodecg.bundleConfig).length) {
		throw new Error('No config found in cfg/nodecg-mixer.json, aborting!');
	}

	if (!nodecg.bundleConfig.channels) {
		throw new Error('No channels present in the config file aborting');
	}

	function log(msg) {
		nodecg.log.info(msg);
		nodecg.sendMessage('log', msg);
	}

	function onFollow(channelName, username) {
		log(`Follow: ${username}`);
		nodecg.sendMessage(FOLLOW, {
			username,
			type: FOLLOW,
			channel: channelName,
			ts: Date.now()
		});
	};

	function onSub(channelName, username, ts) {
		var content = {
			username,
			type: SUBSCRIPTION,
			channel: channelName,
			ts: ts
		};
		log(`Sub: ${username}`);
		nodecg.sendMessage(SUBSCRIPTION, content);
	};

	function onHost(channelName, hoster, ts) {
		log(`Host: ${hoster}`);
		nodecg.sendMessage(HOST, {
			username,
			type: HOST,
			channel: channelName,
			ts: ts
		});
	}

	function onUpdate(channel, data) {
		nodecg.sendMessage('update', channel, data);
	};

	function addChannels() {
		var self = this;
		nodecg.bundleConfig.channels.forEach(channelName => {
			if (channelCache[channelName] === undefined) {
				var channel = new Channel(channelName, nodecg, live);
				channel.on(FOLLOW, onFollow.bind(self, channelName));
				channel.on(SUBSCRIPTION, onSub.bind(self, channelName));
				channel.on('update', onUpdate.bind(self, channelName));
				channel.on(HOST, onHost.bind(self, channelName));
				channelCache[channelName] = channel;
			}
		});
	}

	function eachChannel(func) {
		return toArray(channelCache).map(func);
	}

	function getUnDismissed(type, cb) {
		if (typeof cb !== 'function') {
			return;
		}
		var func = 'findUnDismissedFollows';
		if (type === SUBSCRIPTION) {
			func = 'findUnDismissedSubscriptions';
		}
		const promises = eachChannel(channel => channel[func]());
		Promise.all(promises).then(result => {
			const combinedArray = result
				.reduce((previous, next) => previous.concat(next), [])
				.map(item => {
					return {
						username: item.username,
						type,
						ts: item[type].ts ? item[type].ts : 0,
						channel: 0,
					};
				});
			cb(null, combinedArray);
		}).catch(err => {
			this.nodecg.log.error(err);
			cb(err, [])
		});
	}

	nodecg.listenFor('getFollows', function (value, cb) {
		getUnDismissed(FOLLOW, cb);
	});
	nodecg.listenFor('getChannelData', function(value, cb) {
		cb(null, channelCache[value].data);
	});

	nodecg.listenFor('getSubscriptions', function (value, cb) {
		getUnDismissed(SUBSCRIPTION, cb);
	});

	nodecg.listenFor('dismiss', function (value) {
		console.log('dismiss', value);
		if(value.type === FOLLOW) {
			eachChannel((channel) => channel.dismissFollow(value.username));
		} else {
			eachChannel((channel) => channel.dismissSubscription(value.username));
		}
	});

	addChannels();
};
