'use strict';

let fs = require('fs');
let	mime = require('mime');
let	path = require('path');
let gm = require('gm').subClass({imageMagick: true});
let http = require('needle-retry');
let url = require('url');
let _ = require('lodash');
let random_ua = require('random-ua');

let rootImagesFolder = loopback.get('rootImagesFolder') ? loopback.get('rootImagesFolder') : '/images';
let allowedExtentions = loopback.get('allowedExtentions');

module.exports = function(Image) {
	Image.get = (folder, image, req, cb) => {
		return new Promise((resolve, reject) => {
			if(!fs.existsSync(rootImagesFolder)) {
				let err = new Error("Base path does not exist, create it before running. (" + rootImagesFolder + ")")
				err.status = 500;
				return reject(err);
			}

			var imageSplit = image.split('.');
			var imageExtension = imageSplit[(imageSplit.length-1)];
			var imageName = imageSplit.slice(0, -1).join('.');

			var imagePath = folder + '/' + image;
			var fullPath = path.resolve(rootImagesFolder, imagePath);

			if(!fs.existsSync(fullPath)) {
				let err = new Error("Image does not exist.")
				err.status = 404;
				return reject(err);
			}


			var mimeType = mime.lookup(fullPath);
			if(imageExtension.toLowerCase() === 'gif') {
				fs.readFile(fullPath, (err, data) => {
					if(err) {
						return reject(err);
					}
					return cb(null, data, mimeType);
				});
			}
			else {
				let returnImage = gm(fullPath);
				if(req.hasOwnProperty('query')) {
					_.forOwn(req.query, (value, key) => {
						if(typeof returnImage[key] === 'function') {
							returnImage[key].call(returnImage, ...value.split(','));
						}
					});
				}

				returnImage.toBuffer(mime.extension(mimeType), (err, buffer) => {
					if(err) {
						return reject(err);
					}

					return cb(null, buffer, mimeType);
				});
			}

		});
	};

	Image.download = (folder, name, url, base64, overwrite = false, proxy = false) => {
		return new Promise((resolve, reject) => {
			if(!fs.existsSync(rootImagesFolder)) {
				let err = new Error("Base path does not exist, create it before running. (" + rootImagesFolder + ")")
				err.status = 500;
				return reject(err);
			}

			if(!folder) {
				let err = new Error("Please provide a folder.");
				err.status = 406;
				return reject(err);
			}

			if(!name) {
				let err = new Error("Please provide a file name");
				err.status = 406;
				return reject(err);
			}

			if(url || base64) {
				Image.preCheck(folder, name, overwrite)
				.then(data => {
					if(url) {
						if(proxy) {
							return resolve(Image.downloadUrlImageProxy(url, data));
						}
						else {
							return resolve(Image.downloadUrlImage(url, data));
						}
					}
					else if(base64) {
						return resolve(Image.downloadBase64Image(base64, data));
					}
				}, err => reject(err));
			}
			else {
				let err = new Error("Please provide a url or base64 string");
				err.status = 406;
				return reject(err);
			}
		});
	};

	Image.preCheck = (folder, name, overwrite) => {
		return new Promise((resolve, reject) => {
			if(name.split('.').length <= 1) {
				let err = new Error("Please provide a full file name (file.extention)");
				err.status = 406;
				return reject(err);
			}

			name = name.split('.');
			let extention = name.pop().toLowerCase();
			if(allowedExtentions.indexOf(extention) === -1) {
				let err = new Error("'" + extention + "' extention is not allowed, please use one of the following: " + allowedExtentions.join(', '));
				err.status = 406;
				return reject(err);
			}

			name = name.join('.');
			var directoryLocation = path.resolve(rootImagesFolder, folder);
			let fileLocation = path.resolve(directoryLocation, (name + '.' + extention));
			if(fs.existsSync(fileLocation) && !overwrite){
				let err = new Error("'" + path.resolve(folder, (name + '.' + extention)) + "' already exists.");
				err.status = 406;
				return reject(err);
			}

			if(!fs.existsSync(directoryLocation)){
				fs.mkdirSync(directoryLocation);
			}

			return resolve({
				name: name,
				extention: extention,
				folder: folder,
				folderPath: directoryLocation,
				filePath: fileLocation
			});
		});
	}

	Image.downloadUrlImage = (url, data) => {
		return new Promise((resolve, reject) => {
			http.get(url, (err, response) => {
				if(err) {
					return reject(err);
				}

				if(!response || !response.raw) {
					let err = new Error("No response from image url.");
					err.status = 500;
					return reject(err)
				}

				fs.writeFile(data.filePath, response.raw, (err) => {
					if(err) {
						return reject(err);
					}

					let fileUrl = data.folder + '/' + data.name + '.' + data.extention;
					return resolve({url: process.env.BASE_URL + '/api/image/' + fileUrl});
				});
			});
		});
	};

	Image.downloadUrlImageProxy = (url, data) => {
		return new Promise((resolve, reject) => {
			let Proxy = loopback.models.Proxy;

			Proxy.count()
			.then(count => {
				return Proxy.find({
					limit: 10,
					skip: parseInt(Math.random() * ((count-10) - 1) + 1)
				})
			})
			.then(proxies => {
				proxies = _.map(proxies, proxy => {
					proxy = proxy.toJSON();
					return proxy.protocol + '://' + proxy.host + ':' + proxy.port;
				});

				let retryErrors = ["ECONNRESET", "ECONNREFUSED"];

				let options = {
					user_agent: random_ua.generate(),
					proxy: proxies,
					follow_max: 5,
					compressed: true,
					open_timeout: 5000,
					read_timeout: 1000
				};

				http.get(url, options, (err, response) => {
					if(err) {
						if(retryErrors.indexOf(err.code) >= 0)
						{
							return resolve(Image.downloadUrlImageProxy(url, data));
						}
						return reject(err);
					}

					if(!response || !response.raw) {
						let err = new Error("No response from image url.");
						err.status = 500;
						return reject(err)
					}

					fs.writeFile(data.filePath, response.raw, (err) => {
						if(err) {
							return reject(err);
						}

						let fileUrl = data.folder + '/' + data.name + '.' + data.extention;
						return resolve({url: process.env.BASE_URL + '/api/image/' + fileUrl});
					});
				});
			}, err => reject(err));
		});
	};

	Image.downloadBase64Image = (base64, data) => {
		return new Promise((resolve, reject) => {
			if(base64.indexOf('data:image/') !== 0) {
				let err = new Error("Provided base64 string is not valid.");
				err.status = 406;
				return reject(err);
			}

			let base64Data = base64.split('base64,');
			fs.writeFile(data.filePath, base64Data[1], 'base64', function(err) {
				if(err) {
					return reject(err);
				}

				let fileUrl = data.folder + '/' + data.name + '.' + data.extention;
				return resolve({url: process.env.BASE_URL + '/api/image/' + fileUrl});
			});
		});
	};

	Image.remoteMethod(
		'get', {
			accepts: [{
				arg: 'folder',
				type: 'string',
				required: true,
                http: {
                    source: 'path'
                }
			}, {
				arg: 'file',
				type: 'string',
				required: true,
                http: {
                    source: 'path'
                }
			}, {
				arg: 'req',
				type: 'any',
				http: (ctx) => {
					return ctx.req;
				}
			}],
			http: {
				path: '/:folder/:file',
				verb: 'get'
			},
			returns: [{
                arg: 'body',
                type: 'file',
                root: true
            }, {
                arg: 'Content-Type',
                type: 'string',
                http: {
                    target: 'header'
                }
            }]
		}
	);

	Image.remoteMethod(
		'download', {
			accepts: [{
				arg: 'folder',
				type: 'string',
				required: true,
                http: (ctx) => {
                	if(!ctx.req.body) {
                		return;
                	}

                	if(!ctx.req.body.folder) {
                		return;
                	}

					return ctx.req.body.folder;
				}
			}, {
				arg: 'name',
				type: 'string',
				required: true,
                http: (ctx) => {
                	if(!ctx.req.body) {
                		return;
                	}

                	if(!ctx.req.body.name) {
                		return;
                	}

					return ctx.req.body.name;
				}
			}, {
				arg: 'url',
				type: 'string',
                http: (ctx) => {
                	if(!ctx.req.body) {
                		return;
                	}

                	if(!ctx.req.body.url) {
                		return;
                	}

					return ctx.req.body.url;
				}
			}, {
				arg: 'base64',
				type: 'string',
				default: false,
                http: (ctx) => {
                	if(!ctx.req.body) {
                		return;
                	}

                	if(!ctx.req.body.base64) {
                		return;
                	}

					return ctx.req.body.base64;
				}
			}, {
				arg: 'overwrite',
				type: 'boolean',
				default: false,
                http: (ctx) => {
                	if(!ctx.req.body) {
                		return false;
                	}

                	if(!ctx.req.body.overwrite) {
                		return false;
                	}

					return ctx.req.body.overwrite;
				}
			}, {
				arg: 'proxy',
				type: 'boolean',
				default: false,
                http: (ctx) => {
                	if(!ctx.req.body) {
                		return false;
                	}

                	if(!ctx.req.body.proxy) {
                		return false;
                	}

					return ctx.req.body.proxy;
				}
			}, {
				arg: 'body',
				type: 'object',
				required: true,
                http: {
                	source: 'body'
                }
			}],
			http: {
				path: '/download',
				verb: 'post'
			},
			returns: [{
                arg: 'url',
                type: 'object',
                root: true
            }]
		}
	);
};
