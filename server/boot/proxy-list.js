var hidemyass = require('hidemyass');
var async = require('async');
var fs = require('fs');

let random = (low, high) => {
		return parseInt(Math.random() * (high - low) + low);
};

let generate = (server) => {
		var totalProxies = [];
		var pages = {
				start: random(1, 5),
				end: random(15, 30)
		};

		console.log('Getting proxy list');
		hidemyass.proxies().get(pages, (err, proxies) => {
				if (err) {
						console.log('An error occured.', err);
				} else {
					console.log('Got proxy list.');

					let Proxy = server.models.Proxy;
					async.each(proxies, (proxy, next) => {
							if (proxy.speed <= 6000 && (proxy.protocol === 'http' || proxy.protocl === 'https')) {
									let url = proxy.protocol + '://' + proxy.ip + ':' + proxy.port;

									// console.log(url);
									Proxy.findOrCreate({
										where: {
											host: proxy.ip,
											protocol: proxy.protocol,
											port: parseInt(proxy.port)
										}
									}, {
										host: proxy.ip,
										protocol: proxy.protocol,
										port: parseInt(proxy.port),
										speed: proxy.speed
									})
									.then(proxy => {
										next();
									}, err => next(err));
							}
					}, err => {
							if (err) {
									throw new Error(err);
							}

					});

					console.log('Done saving possible proxies.');
				}
		});
};

module.exports = generate;
