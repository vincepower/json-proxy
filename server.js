'use strict'
const queryString = require('querystring');
const request = require('request');
const xml2json = require('xml2json');
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const DB_PATH = 'mongodb://localhost/cache';
const Cache = require('./models/Cache.js');

app.use(function(req, res, next) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Content-length, Accept, Cache-Control');
	res.setHeader('Cache-Control','no-cache, no-store, must-revalidate');
	res.setHeader('Pragma','no-cache');
	res.setHeader('Expires','0');
	res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
	next();
});

app.use(express.json())

mongoose.connect(DB_PATH, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
});


function pullParams(queryObj,pattern) {
	var obj = {};
	//Pattern for is the request looks like `params[format]`
	for(let key in queryObj) {
		var patternMatch = key.match(pattern);
		if(patternMatch) {
			//Get captured pattern
			var newKey = patternMatch[1];
			obj[newKey] = queryObj[key];
		}


	}
	return obj;
}

const getRequest = (url, data, headers) => {
	return request.get({
		url: `${url}?${data}`,
		headers
	});
}

app.all('/', (req,res) => {
	let query = '';
	if(req.method !== "POST") {
		query = queryString.parse(req.url.substring(2));
	}
	else {
		query = req.body;
	}

	if(!query.xmlToJSON) {
		query.xmlToJSON = false;
	}
	if(query.reqUrl) {

		var url = query.reqUrl;
		if(req.method !== 'POST') {
			var params = pullParams(query,/params\[(.*)\]/);
			var userHeaders = pullParams(query,/proxyHeaders\[(.*)\]/);
		}
		else {
			var params = query.params;
			var userHeaders = query.proxyHeaders;
		}
		var data = queryString.stringify(params);
		var headers = Object.assign({},userHeaders,{
			'User-Agent': 'Proxy.hackeryou.com',
		});

		if (query.useCache === "true") {
			const cacheUrl = `${url}?${data}`
			const cached = Cache.findOne({endpoint: cacheUrl}, (err, doc) => {
				if (err) console.log(err);

				if (doc) {
					console.log('Retrieved from cache.');
					res.status(200)
						.send(JSON.parse(doc.response));
					return;
				} else {
					const requestStream = getRequest(url, data, headers);
					let reqRes = '';
					requestStream.on('data', (buff) => {
						reqRes += buff.toString();
					});
					requestStream.on('end', () => {
							const cache = new Cache();
							cache.endpoint = cacheUrl;
							cache.response = JSON.stringify(reqRes);
							cache.date = new Date();
							cache.save()
								.then(() => {
									console.log('Saved in cache.')
									res.status(200)
										.send(reqRes.toString());
								})
								.catch((err) => {
									console.log('Error saving in cache: ' + err);
									res.status(500)
										.send(err);
								});
						});
				}
			});
		} else {
			if(req.method === "POST") {
				const defaultHeaders = {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Accept': 'application/json'
				}; // these can be overriden by user provided headers

				const requestHeaders = Object.assign({}, defaultHeaders, headers);

				console.log(requestHeaders);

				request.post({
						url: url,
					headers: requestHeaders,
					body: JSON.stringify(params),
					},(err,response,body) => {
					if(query.xmlToJSON === 'true') {
						body = xml2json.toJson(body);
					}
					if(response && response.statusCode === 200) {
						res.status(200)
							.send(body);
					}
					else {;
						res.status(400)
							.send(body);
					}
				});
			}
			else {
				console.log(data);
				request.get({
						url: url + '?' + data,
						headers: headers
					},(err,response,body) => {
					if(query.xmlToJSON === 'true') {
						body = xml2json.toJson(body);
					}
					if(response && response.statusCode === 200) {
						res.status(200)
							.send(body);
					}
					else {;
						res.status(400)
							.send(body);
					}
				});
			}
		}
	}
	else {
		res.end('{"error": "Request must contain a reqUrl param"}');
	}
});

app.listen(4500);
