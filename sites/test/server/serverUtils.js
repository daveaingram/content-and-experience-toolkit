/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global module, process */
/* jshint esversion: 6 */

/**
 * Utilities for Local Server
 */

var express = require('express'),
	app = express(),
	os = require('os'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	ps = require('ps-node'),
	uuid4 = require('uuid/v4'),
	puppeteer = require('puppeteer'),
	btoa = require('btoa'),
	url = require('url'),
	Client = require('node-rest-client').Client;

var componentsDir,
	connectionsDir,
	connectorsDir,
	serversDir,
	templatesDir,
	themesDir,
	loginReported = false; // only report logging in once

var _setupSourceDir = function (projectDir) {
	if (projectDir) {
		var srcfolder = _getSourceFolder(projectDir);

		componentsDir = path.join(srcfolder, 'components');
		connectionsDir = path.join(srcfolder, 'connections');
		connectorsDir = path.join(srcfolder, 'connectors');
		serversDir = path.join(srcfolder, 'servers');
		templatesDir = path.join(srcfolder, 'templates');
		themesDir = path.join(srcfolder, 'themes');
	}
};

/**
 * Get the source folder.
 */
module.exports.getSourceFolder = function (currPath) {
	return _getSourceFolder(currPath);
};
var _getSourceFolder = function (currPath) {
	// var newSrc = _isNewSource(currPath);
	// var srcfolder = newSrc ? path.join(currPath, 'src') : path.join(currPath, 'src', 'main');
	var srcfolder = path.join(currPath, 'src');
	if (!fs.existsSync(srcfolder)) {
		fse.mkdirSync(srcfolder);
	}
	if (!fs.existsSync(path.join(srcfolder, 'components'))) {
		fse.mkdirSync(path.join(srcfolder, 'components'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'connections'))) {
		fse.mkdirSync(path.join(srcfolder, 'connections'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'connectors'))) {
		fse.mkdirSync(path.join(srcfolder, 'connectors'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'content'))) {
		fse.mkdirSync(path.join(srcfolder, 'content'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'documents'))) {
		fse.mkdirSync(path.join(srcfolder, 'documents'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'servers'))) {
		fse.mkdirSync(path.join(srcfolder, 'servers'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'templates'))) {
		fse.mkdirSync(path.join(srcfolder, 'templates'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'theme'))) {
		fse.mkdirSync(path.join(srcfolder, 'theme'));
	}
	if (!fs.existsSync(path.join(srcfolder, 'translationJobs'))) {
		fse.mkdirSync(path.join(srcfolder, 'translationJobs'));
	}

	return srcfolder;
};

/**
 * Get the build folder.
 */
module.exports.getBuildFolder = function (currPath) {
	return _getBuildFolder(currPath);
};
var _getBuildFolder = function (currPath) {
	var newSrc = _isNewSource(currPath);
	var buildFolder = newSrc ? path.join(currPath, 'build') : path.join(currPath, 'src', 'build');
	return buildFolder;
};

/**
 * Check if the project uses the new src structure
 */
module.exports.isNewSource = function (currPath) {
	return _isNewSource(currPath);
};
var _isNewSource = function (currPath) {
	var newSrc = true;
	var packageFile = path.join(currPath, 'package.json');
	if (fs.existsSync(packageFile)) {
		var packageJSON = JSON.parse(fs.readFileSync(packageFile));
		if (packageJSON && packageJSON.name === 'cec-sites-toolkit') {
			newSrc = false;
		}
	}
	return newSrc;
};

var _closeServer = function (localServer) {
	if (localServer) {
		localServer.close();
	}
};

/**
 * Get server and credentials from gradle properties
 */
module.exports.getConfiguredServer = function (currPath) {
	return _getConfiguredServer(currPath);
};
var _getConfiguredServer = function (currPath) {
	var configFile;
	if (process.env.CEC_PROPERTIES) {
		configFile = process.env.CEC_PROPERTIES;
	} else if (currPath && fs.existsSync(path.join(currPath, 'cec.properties'))) {
		configFile = path.join(currPath, 'cec.properties');
	} else {
		configFile = path.join(os.homedir(), '.gradle', 'gradle.properties');
	}
	// console.log('CEC configure file: ' + configFile);
	var server = {
		fileloc: configFile,
		fileexist: false,
		url: '',
		username: '',
		password: '',
		oauthtoken: '',
		env: '',
		idcs_url: '',
		client_id: '',
		client_secret: '',
		scope: ''
	};
	if (fs.existsSync(configFile)) {
		server.fileexist = true;
		try {
			var cecurl,
				username,
				password,
				env,
				idcs_url,
				client_id,
				client_secret,
				scope,
				srcfolder;

			fs.readFileSync(configFile).toString().split('\n').forEach(function (line) {
				if (line.indexOf('cec_url=') === 0) {
					cecurl = line.substring('cec_url='.length);
					cecurl = cecurl.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_username=') === 0) {
					username = line.substring('cec_username='.length);
					username = username.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_password=') === 0) {
					password = line.substring('cec_password='.length);
					password = password.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_env=') === 0) {
					env = line.substring('cec_env='.length);
					env = env.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_source_folder=') === 0) {
					srcfolder = line.substring('cec_source_folder='.length);
					srcfolder = srcfolder.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_idcs_url=') === 0) {
					idcs_url = line.substring('cec_idcs_url='.length);
					idcs_url = idcs_url.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_client_id=') === 0) {
					client_id = line.substring('cec_client_id='.length);
					client_id = client_id.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_client_secret=') === 0) {
					client_secret = line.substring('cec_client_secret='.length);
					client_secret = client_secret.replace(/(\r\n|\n|\r)/gm, '').trim();
				} else if (line.indexOf('cec_scope=') === 0) {
					scope = line.substring('cec_scope='.length);
					scope = scope.replace(/(\r\n|\n|\r)/gm, '').trim();
				}
			});
			if (cecurl && username && password) {
				server.url = cecurl;
				server.username = username;
				server.password = password;
				server.env = env || 'pod_ec';
				server.oauthtoken = '';
				server.idcs_url = idcs_url;
				server.client_id = client_id;
				server.client_secret = client_secret;
				server.scope = scope;
			}

			// console.log('configured server=' + JSON.stringify(server));
		} catch (e) {
			console.log('Failed to read config: ' + e);
		}
	}
	return server;
};

/**
 * Return the auth object for request
 * @param server the object obtained from API getConfiguredServer()
 */
module.exports.getRequestAuth = function (server) {
	return _getRequestAuth(server);
};
var _getRequestAuth = function (server) {
	var auth = server.env === 'dev_ec' ? {
		user: server.username,
		password: server.password
	} : {
		bearer: server.oauthtoken
	};
	return auth;
};

module.exports.verifyServer = function (serverName, currPath) {
	return _verifyServer(serverName, currPath);
};
var _verifyServer = function (serverName, currPath) {
	var server = {};
	if (serverName) {
		_setupSourceDir(currPath);
		
		var serverpath = path.join(serversDir, serverName, 'server.json');
		if (!fs.existsSync(serverpath)) {
			console.log('ERROR: server ' + serverName + ' does not exist');
			return server;
		}
	}

	server = serverName ? _getRegisteredServer(currPath, serverName) : _getConfiguredServer(currPath);
	if (!serverName) {
		console.log(' - configuration file: ' + server.fileloc);
	}
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured in ' + server.fileloc);
		return server;
	}

	server['valid'] = true;
	return server;
};


/**
 * Create a 44 char GUID
 * ‘C’ + 32 char complete UUID + 11 char from another UUID
 */
module.exports.createGUID = function () {
	return _createGUID();
};
var _createGUID = function () {
	'use strict';
	let guid1 = uuid4();
	let guid2 = uuid4();
	guid1 = guid1.replace(/-/g, '').toUpperCase();
	guid2 = guid2.replace(/-/g, '').toUpperCase();
	const guid = 'C' + guid1 + guid2.substr(0, 11);
	return guid;
};

/**
 * Utility check if a string ends with 
 */
module.exports.endsWith = (str, end) => {
	return _endsWith(str, end);
};
var _endsWith = function (str, end) {
	return str.lastIndexOf(end) === str.length - end.length;
};

module.exports.trimString = (str, search) => {
	if (!str || !search) {
		return str;
	}
	var val = str;

	// remove leading
	while (val.startsWith(search)) {
		val = val.substring(search.length);
	}

	// remove trailing
	while (_endsWith(val, search)) {
		val = val.substring(0, val.length - search.length);
	}
	return val;
};

/**
 * Utility replace all occurrences of a string
 */
module.exports.replaceAll = (str, search, replacement) => {
	return _replaceAll(str, search, replacement);
};
var _replaceAll = function (str, search, replacement) {
	var re = new RegExp(search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
	return str.replace(re, replacement || '');
};

module.exports.fixHeaders = (origResponse, response) => {
	_fixHeaders(origResponse, response);
};
var _fixHeaders = function (origResponse, response) {
	var headers = origResponse.rawHeaders, // array [name1, value1, name2, value2, ...]
		i = 0,
		headerNames = [],
		headerName;

	for (i = 0; i < headers.length; i = i + 2) {
		headerName = headers[i];
		// collect header name
		headerNames.push(headerName);

		// regarding capitalization, we're only taking care of SCS 'ETag-something' headers
		if (headerName.indexOf('ETag-') === 0) {
			// remove the corresponding lower case header from the proxied response object
			// (it otherwise takes precedence when piped to the actual response)
			delete origResponse.headers[headerName.toLowerCase()];
			// set the capitalized header name in the new response object
			response.setHeader(headerName, headers[i + 1]);
		}
	}

	// explicitly declare headers for cross-domain requests
	response.setHeader('Access-Control-Expose-Headers', headerNames.join(','));
};

module.exports.getURLParameters = function (queryString) {
	return _getURLParameters(queryString);
};
var _getURLParameters = function (queryString) {
	var params = {};
	if (!queryString || queryString.indexOf('=') < 0) {
		console.log(' queryString ' + queryString + ' is empty or not valid');
		return params;
	}
	var parts = queryString.split('&');
	for (var i = 0; i < parts.length; i++) {
		var nameval = parts[i].split('='),
			name = nameval[0],
			val = nameval[1] || '';
		params[name] = decodeURIComponent(val);
	}
	// console.log(params);
	return params;
};

/**
 * Update itemGUID in _folder.json for a give item in /src
 * @param type type of the item (template, theme, component)
 * @param name name of the item
 */
module.exports.updateItemFolderJson = function (projectDir, type, name, propName, propValue) {
	"use strict";

	_setupSourceDir(projectDir);

	if (type !== 'template' && type !== 'theme' && type !== 'component') {
		console.log('updateItemFolderJson: invalid type ' + type);
		return false;
	}
	if (!name) {
		console.log('updateItemFolderJson: no name is specified');
		return false;
	}

	var file = path.join(type === 'template' ? templatesDir : (type === 'theme' ? themesDir : componentsDir), name, '_folder.json');
	// console.log('file=' + file);
	if (!fs.existsSync(file)) {
		console.error('ERROR: file does not exist ' + file);
		return false;
	}

	var folderstr = fs.readFileSync(file),
		folderjson = JSON.parse(folderstr),
		oldGUID = folderjson.itemGUID,
		newGUID = _createGUID();
	folderjson.itemGUID = newGUID;
	console.log(' - update ' + type + ' GUID ' + oldGUID + ' to ' + newGUID);
	if (propName && folderjson.hasOwnProperty(propName)) {
		var oldValue = folderjson[propName];
		folderjson[propName] = propValue;
		console.log(' - update ' + type + ' ' + propName + ' ' + oldValue + ' to ' + propValue);
	}
	fs.writeFileSync(file, JSON.stringify(folderjson));
	return true;
};

/**
 * Get a server in serversDir.
 */
module.exports.getRegisteredServer = function (projectDir, name) {
	"use strict";

	return _getRegisteredServer(projectDir, name);
};
var _getRegisteredServer = function (projectDir, name) {
	"use strict";

	_setupSourceDir(projectDir);

	var server = {};
	var serverpath = path.join(serversDir, name, "server.json");
	if (fs.existsSync(serverpath)) {
		var serverstr = fs.readFileSync(serverpath).toString(),
			serverjson = JSON.parse(serverstr);
		server = serverjson;
		server['fileloc'] = serverpath;
		server['fileexist'] = true;
	}
	// console.log(server);
	return server;
};

/**
 * get request 
 */
module.exports.getRequest = function (projectDir) {
	"use strict";
	return _getRequest();
};
var _getRequest = function () {
	var request = require('request');
	request = request.defaults({
		headers: {
			connection: 'keep-alive'
		},
		pool: {
			maxSockets: 50
		},
		jar: true,
		proxy: null
	});
	return request;
};

/**
 * Get components in componentsDir.
 */
module.exports.getComponents = function (projectDir) {
	"use strict";

	_setupSourceDir(projectDir);

	var components = [],
		items = fs.existsSync(componentsDir) ? fs.readdirSync(componentsDir) : [];
	if (items) {
		items.forEach(function (name) {
			var folderpath = path.join(componentsDir, "/", name, "_folder.json");
			if (fs.existsSync(path.join(componentsDir, "/", name, "appinfo.json")) && fs.existsSync(folderpath)) {
				// get the component type
				var folderstr = fs.readFileSync(folderpath).toString(),
					folderjson = JSON.parse(folderstr),
					comptype = folderjson.appType;
				components.push({
					name: name,
					type: comptype
				});
			}
		});
	}

	if (components.length === 0) {
		console.error("No components found in " + componentsDir);
	}
	return components;
};

/**
 * Get all templates that use this component
 * @param compName
 */
module.exports.getComponentTemplates = function (projectDir, compName) {
	_setupSourceDir(projectDir);

	var temps = [],
		compSrcDir = path.join(componentsDir, compName);

	if (!fs.existsSync(compSrcDir)) {
		console.log('getComponentTemplates: ERROR component ' + compName + ' does not exist');
		return temps;
	}

	var alltemps = _getTemplates();

	for (var i = 0; i < alltemps.length; i++) {
		var tempname = alltemps[i].name,
			tempcomps = _getTemplateComponents(tempname)
		for (var j = 0; j < tempcomps.length; j++) {
			if (tempcomps[j] === compName) {
				temps[temps.length] = alltemps[i].name;
			}
		}
	}
	return temps;
};

/**
 * Get templates in templatesDir.
 */
module.exports.getTemplates = function (projectDir) {
	_setupSourceDir(projectDir);

	return _getTemplates();
};
var _getTemplates = function () {
	"use strict";
	var templates = [];
	var items = fs.existsSync(templatesDir) ? fs.readdirSync(templatesDir) : [];
	if (items) {
		items.forEach(function (name) {
			if (fs.existsSync(templatesDir + "/" + name + "/_folder.json")) {
				templates.push({
					name: name
				});
			}
		});
	}

	if (templates.length === 0) {
		console.error("No components found in " + templatesDir);
	}
	return templates;
};

/**
 * Get all custom components used by a template
 * @param templateName
 */
module.exports.getTemplateComponents = function (projectDir, templateName) {
	_setupSourceDir(projectDir);

	return _getTemplateComponents(templateName);
}
var _getTemplateComponents = function (templateName) {
	var comps = [],
		tempSrcDir = path.join(templatesDir, templateName);

	if (!fs.existsSync(tempSrcDir)) {
		console.log('getTemplateComponents: template ' + templateName + ' does not exist');
		return comps;
	}

	var pages = fs.readdirSync(path.join(tempSrcDir, 'pages'));
	for (var i = 0; i < pages.length; i++) {
		var pagepath = path.join(tempSrcDir, 'pages', pages[i]),
			pagestr = fs.readFileSync(pagepath),
			pagejson = JSON.parse(pagestr),
			componentInstances = pagejson.componentInstances || {},
			compvalues;

		Object.keys(componentInstances).forEach(function (key) {
			compvalues = componentInstances[key];
			if (compvalues && (compvalues.type === 'scs-component' || compvalues.type === 'scs-componentgroup' || compvalues.type === 'scs-app') && compvalues.id) {
				var added = false;
				for (var j = 0; j < comps.length; j++) {
					if (compvalues.id === comps[j]) {
						added = true;
						break;
					}
				}
				if (!added) {
					comps[comps.length] = compvalues.id;
				}
			}
		});
	}

	// get all content layouts used by this template
	var contentmapfile = path.join(tempSrcDir, 'caas_contenttypemap.json');
	if (fs.existsSync(contentmapfile)) {
		var contenttypes = JSON.parse(fs.readFileSync(contentmapfile));
		for (var i = 0; i < contenttypes.length; i++) {
			var ctype = contenttypes[i];
			for (var j = 0; j < ctype.categoryList.length; j++) {
				var layout = ctype.categoryList[j].layoutName;
				if (layout && comps.indexOf(layout) < 0) {
					comps[comps.length] = layout;
				}
			}
		}
	}

	var summaryfile = path.join(tempSrcDir, 'assets', 'contenttemplate', 'summary.json');
	if (fs.existsSync(summaryfile)) {
		var summaryjson = JSON.parse(fs.readFileSync(summaryfile));
		var mappings = summaryjson.categoryLayoutMappings || [];
		for (var i = 0; i < mappings.length; i++) {
			var catelist = mappings[i].categoryList;
			for (var j = 0; j < catelist.length; j++) {
				var layout = catelist[j].layoutName;
				if (layout && comps.indexOf(layout) < 0) {
					comps[comps.length] = layout;
				}
			}
		}
	}

	comps.sort();

	// console.log('getTemplateComponents: template=' + templateName + ' components=' + JSON.stringify(comps));
	return comps;
};

/**
 * Get the icon of a template (_folder_icon.png or _folder_icon.jpg)
 * @param templateName
 */
module.exports.getTemplateIcon = function (projectDir, templateName) {
	_setupSourceDir(projectDir);

	return _getTemplateIcon(templateName);
}

var _getTemplateIcon = function (templateName) {
	var icon = '',
		tempSrcDir = path.join(templatesDir, templateName);

	if (!fs.existsSync(tempSrcDir)) {
		console.log('getTemplateIcon: template ' + templateName + ' does not exist');
		return icon;
	}

	var files = fs.readdirSync(tempSrcDir),
		iconfile = '';
	for (var i = 0; i < files.length; i++) {
		if (files[i].indexOf('_folder_icon') === 0) {
			iconfile = path.join(tempSrcDir, files[i]);
			break;
		}
	}
	// console.log('iconfile=' + iconfile);
	if (iconfile && fs.existsSync(iconfile)) {
		icon = fs.readFileSync(iconfile);
	}

	return icon;
};

/**
 * Get all content items (across templates) that use this content layout 
 * @param layoutName
 */
module.exports.getContentLayoutItems = function (projectDir, layoutName) {
	_setupSourceDir(projectDir);

	var items = [],
		layoutSrcDir = path.join(componentsDir, layoutName);

	if (!layoutName || !fs.existsSync(layoutSrcDir)) {
		console.log('getContentLayoutItems: content layout ' + layoutName + ' does not exist');
		return items;
	}
	console.log('getContentLayoutItems: ' + layoutName);

	// go through all templates
	var temps = fs.readdirSync(templatesDir),
		contenttypes = [];
	for (var i = 0; i < temps.length; i++) {
		var contentmapfile = path.join(templatesDir, temps[i], 'caas_contenttypemap.json');
		if (fs.existsSync(contentmapfile)) {
			var ctypes = JSON.parse(fs.readFileSync(contentmapfile));
			for (var j = 0; j < ctypes.length; j++) {
				var ctype = ctypes[j];
				for (var k = 0; k < ctype.categoryList.length; k++) {
					if (ctype.categoryList[k].layoutName === layoutName) {
						var found = false;
						for (var p = 0; p < contenttypes.length; p++) {
							found = found || (contenttypes[p].template === temps[i] && contenttypes[p].type === ctype.type);
						}
						if (!found) {
							contenttypes[contenttypes.length] = {
								template: temps[i],
								type: ctype.type
							};
						}
					}
				}
			}
		}
	}
	// console.log(contenttypes);
	if (contenttypes.length === 0) {
		console.log('getContentLayoutItems: content layout ' + layoutName + ' is not used by any content items');
		return items;
	}
	console.log(' - types: ' + JSON.stringify(contenttypes));

	for (var j = 0; j < contenttypes.length; j++) {
		var tempname = contenttypes[j].template,
			temppath = path.join(templatesDir, tempname),
			ctype = contenttypes[j].type,
			itemspath = path.join(temppath, 'assets', 'contenttemplate',
				'Content Template of ' + tempname, 'ContentItems', ctype);

		if (fs.existsSync(itemspath)) {
			var itemfiles = fs.readdirSync(itemspath);
			for (var k = 0; k < itemfiles.length; k++) {
				var itemjson = JSON.parse(fs.readFileSync(path.join(itemspath, itemfiles[k]))),
					found = false;

				for (var idx = 0; idx < items.length; idx++) {
					if (itemjson.id === items[idx].id) {
						found = true;
					}
				}

				if (!found) {
					items[items.length] = {
						id: itemjson.id,
						name: itemjson.name,
						type: itemjson.type,
						template: tempname,
						data: itemjson
					}
				}
			}
		}
	}

	// sort by item name
	if (items.length > 0) {
		var byName = items.slice(0);
		byName.sort(function (a, b) {
			var x = a.name;
			var y = b.name;
			return (x < y ? -1 : x > y ? 1 : 0);
		});
		items = byName;

		var msgs = '';
		for (var i = 0; i < items.length; i++) {
			msgs = msgs + items[i].type + ':' + items[i].name + ' ';
		}
		console.log(' - items ' + msgs);
	}

	return items;
};

/**
 * Get all content types (across templates)
 */
module.exports.getContentTypes = function (projectDir) {
	_setupSourceDir(projectDir);

	return _getContentTypes();
};
var _getContentTypes = function () {
	var types = [],
		alltemps = _getTemplates();

	for (var i = 0; i < alltemps.length; i++) {
		var tempname = alltemps[i].name,
			typespath = path.join(templatesDir, tempname, 'assets', 'contenttemplate',
				'Content Template of ' + tempname, 'ContentTypes');
		if (fs.existsSync(typespath)) {
			var typefiles = fs.readdirSync(typespath);
			for (var j = 0; j < typefiles.length; j++) {
				var typejson = JSON.parse(fs.readFileSync(path.join(typespath, typefiles[j])));
				types[types.length] = {
					template: tempname,
					type: typejson
				};
			}
		}
	}
	// console.log(' - getContentTypes: total content types: ' + types.length);
	return types;
};


/**
 * Get a content types (from a template)
 * @param typeName the content type name
 * @param templateName the template name, if not specified, return the first type with the name
 */
module.exports.getContentType = function (projectDir, typeName, templateName) {
	_setupSourceDir(projectDir);

	var contenttype = {},
		alltypes = _getContentTypes()

	for (var i = 0; i < alltypes.length; i++) {
		if (typeName === alltypes[i].type.name &&
			(!templateName || templateName === alltypes[i].template)) {
			contenttype = alltypes[i].type;
			break;
		}
	}

	return contenttype;
};

/**
 * Get content types from server
 */
module.exports.getContentTypesFromServer = function (server) {
	var contentTypesPromise = new Promise(function (resolve, reject) {
		if (!server || !server.url || !server.username || !server.password) {
			return console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}

		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/content/management/api/v1.1/types?limit=9999';
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				console.log('ERROR: failed to query content types - ' + (response.statusMessage || response.statusCode));
				resolve({
					err: 'failed to query content types: ' + response.statusCode
				});
			}
		});
	});
	return contentTypesPromise;
};

/**
 * Get content type from server
 */
module.exports.getContentTypeFromServer = function (server, typename) {
	var contentTypePromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			resolve({
				err: 'no server'
			});
		}
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/content/management/api/v1.1/types/' + typename;
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				resolve(data);
			} else {
				// console.log('status=' + response.statusCode);
				resolve({
					err: 'type ' + typename + ' does not exist'
				});
			}
		});
	});
	return contentTypePromise;
};


/**
 * Get all fields of a content types from server
 */
module.exports.getContentTypeFieldsFromServer = function (server, typename, callback) {
	if (!server.url || !server.username || !server.password) {
		console.log('ERROR: no server is configured');
		return;
	}
	var client = new Client({
		user: server.username,
		password: server.password
	});
	var url = server.url + '/content/management/api/v1.1/types/' + typename;
	client.get(url, function (data, response) {
		var fields = [];
		if (response && response.statusCode === 200 && data && data.fields) {
			fields = data.fields;
		} else {
			// console.log('status=' + response.statusCode + ' err=' + err);
		}
		callback(fields);
	});
};

module.exports.getCaasCSRFToken = function (server) {
	var csrfTokenPromise = new Promise(function (resolve, reject) {
		var client = new Client({
			user: server.username,
			password: server.password
		});
		var url = server.url + '/content/management/api/v1.1/token';
		client.get(url, function (data, response) {
			if (response && response.statusCode === 200) {
				return resolve(data);
			} else {
				console.log('ERROR: Failed to get CSRF token, status=' + response.statusCode);
				return resolve({
					err: 'err'
				});
			}
		});
	});
	return csrfTokenPromise;
};

/**
 * Get translation connectors in src/connectors/
 */
module.exports.getTranslationConnectors = function (projectDir) {
	"use strict";

	_setupSourceDir(projectDir);

	var connectors = [],
		items = fs.existsSync(connectorsDir) ? fs.readdirSync(connectorsDir) : [];
	if (items) {
		items.forEach(function (name) {
			if (fs.existsSync(path.join(connectorsDir, name, 'package.json'))) {
				connectors.push({
					name: name
				});
			}
		});
	}

	/*
	if (connectors.length === 0) {
		console.error("No translation connectors found in " + connectorsDir);
	}
	*/

	return connectors;
};

/**
 * Get translation connections in src/connections/
 */
module.exports.getTranslationConnections = function (projectDir) {
	"use strict";

	_setupSourceDir(projectDir);

	var connections = [],
		items = fs.existsSync(connectionsDir) ? fs.readdirSync(connectionsDir) : [];
	if (items) {
		items.forEach(function (name) {
			if (fs.existsSync(path.join(connectionsDir, name, 'connection.json'))) {
				connections.push({
					name: name
				});
			}
		});
	}

	return connections;
};

/**
 * Get OAuth token from IDCS
 */
module.exports.getOAuthTokenFromIDCS = function (request, server) {
	return _getOAuthTokenFromIDCS(request, server);
};

var _getOAuthTokenFromIDCS = function (request, server) {
	var tokenPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({
				err: 'no server'
			});
		}

		if (!server.idcs_url) {
			console.log('ERROR: no IDCS url is found');
			return resolve({
				err: 'no IDCS url'
			});
		}
		if (!server.client_id) {
			console.log('ERROR: no client id is found');
			return resolve({
				err: 'no client id'
			});
		}
		if (!server.client_secret) {
			console.log('ERROR: no client secret is found');
			return resolve({
				err: 'no client secret'
			});
		}
		if (!server.scope) {
			console.log('ERROR: no scope is found');
			return resolve({
				err: 'no scope'
			});
		}

		var url = server.idcs_url + '/oauth2/v1/token';
		var auth = {
			user: server.client_id,
			password: server.client_secret
		};

		var formData = new URLSearchParams();
		formData.append('grant_type', 'password');
		formData.append('username', server.username);
		formData.append('password', server.password);
		formData.append('scope', server.scope);

		var postData = {
			method: 'POST',
			url: url,
			auth: auth,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded;'
			},
			body: formData.toString(),
			json: true
		};

		request(postData, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get OAuth token');
				console.log(err);
				return resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (error) {
				data = body;
			};

			if (!data || response.statusCode !== 200) {
				var msg = data ? (data.error + ':' + data.error_description) : (response.statusMessage || response.statusCode);
				console.log('ERROR: Failed to get OAuth token - ' + msg);
				return resolve({
					err: 'err'
				});
			} else {
				return resolve({
					oauthtoken: data.token_type + ' ' + data.access_token
				});
			}
		});
	});
	return tokenPromise;
};

/**
 * Get template from server
 */
module.exports.getTemplateFromServer = function (request, server, templateName) {
	var templatePromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var url = server.url + '/sites/management/api/v1/templates?expand=localizationPolicy&expansionErrors=ignore';

		var options = {
			url: url
		};
		if (server.env !== 'dev_ec') {
			options.headers = {
				Authorization: server.oauthtoken
			};
		} else {
			options.auth = {
				user: server.username,
				password: server.password
			};
		}

		request(options, function (error, response, body) {
			var result = {};

			if (error) {
				console.log('ERROR: failed to get template:');
				console.log(error);
				resolve({
					err: error
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				var items = data && data.items;
				// console.log(items);
				var template;
				for (var i = 0; i < items.length; i++) {
					if (items[i].name.toLowerCase() === templateName.toLowerCase()) {
						template = items[i];
					}
				}
				resolve({
					data: template
				});
			} else {
				console.log('ERROR: failed to get template: ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: (response ? (response.statusMessage || response.statusCode) : 'err')
				});
			}

		});
	});
	return templatePromise;
};

/**
 * Get site from server
 */
module.exports.getSiteFromServer = function (request, server, siteName) {
	var sitePromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var url = server.url + '/sites/management/api/v1/sites';
		var options = {
			url: url
		};
		if (server.env !== 'dev_ec') {
			options.headers = {
				Authorization: server.oauthtoken
			};
		} else {
			options.auth = {
				user: server.username,
				password: server.password
			};
		}

		request(options, function (error, response, body) {
			var result = {};

			if (error) {
				console.log('ERROR: failed to get site:');
				console.log(error);
				resolve({
					err: error
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				var items = data && data.items;
				// console.log(items);
				var site;
				for (var i = 0; i < items.length; i++) {
					if (items[i].name.toLowerCase() === siteName.toLowerCase()) {
						site = items[i];
					}
				}
				resolve({
					data: site
				});
			} else {
				console.log('ERROR: failed to get site: ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: (response ? (response.statusMessage || response.statusCode) : 'err')
				});
			}

		});
	});
	return sitePromise;
};

/**
 * Get repository from server
 */
module.exports.getRepositoryFromServer = function (request, server, repositoryName) {
	var repositoryPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}

		var auth = {
			user: server.username,
			password: server.password
		};

		var url = server.url + '/content/management/api/v1.1/repositories?fields=all&includeAdditionalData=true';

		var options = {
			url: url,
			auth: auth
		};
		request(options, function (error, response, body) {
			var result = {};

			if (error) {
				console.log('ERROR: failed to get repository:');
				console.log(error);
				resolve({
					err: error
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				var items = data && data.items;
				// console.log(items);
				var repository;
				for (var i = 0; i < items.length; i++) {
					if (items[i].name.toLowerCase() === repositoryName.toLowerCase()) {
						repository = items[i];
					}
				}
				resolve({
					data: repository
				});
			} else {
				console.log('ERROR: failed to get repository: ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: (response ? (response.statusMessage || response.statusCode) : 'err')
				});
			}

		});
	});
	return repositoryPromise;
};

module.exports.getRepositoryCollections = function (request, server, repositoryId) {
	var collectionPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}

		var auth = {
			user: server.username,
			password: server.password
		};

		var url = server.url + '/content/management/api/v1.1/repositories/' + repositoryId + '/collections';

		var options = {
			url: url,
			auth: auth
		};
		request(options, function (error, response, body) {
			var result = {};

			if (error) {
				console.log('ERROR: failed to get repository collections:');
				console.log(error);
				resolve({
					err: error
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				var items = data && data.items;
				// console.log(items);

				resolve({
					data: items
				});
			} else {
				console.log('ERROR: failed to get repository collections: ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: (response ? (response.statusMessage || response.statusCode) : 'err')
				});
			}

		});
	});
	return collectionPromise;
};


/**
 * Get localization policy from server
 */
module.exports.getLocalizationPolicyFromServer = function (request, server, policyIdentifier, identifierType) {
	var policyPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}

		var auth = {
			user: server.username,
			password: server.password
		};

		var url = server.url + '/content/management/api/v1.1/policy';

		var options = {
			url: url,
			auth: auth
		};
		request(options, function (error, response, body) {

			if (error) {
				console.log('ERROR: failed to get localization policy:');
				console.log(error);
				resolve({
					err: error
				});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				var items = data && data.items;
				var policy;
				for (var i = 0; i < items.length; i++) {
					if (identifierType && identifierType === 'id') {
						if (items[i].id === policyIdentifier) {
							policy = items[i];
						}
					} else {
						if (items[i].name === policyIdentifier) {
							policy = items[i];
							break;
						}
					}
				}
				resolve({
					data: policy
				});
			} else {
				console.log('ERROR: failed to get localization policy: ' + (response ? (response.statusMessage || response.statusCode) : ''));
				resolve({
					err: (response ? (response.statusMessage || response.statusCode) : 'err')
				});
			}

		});
	});
	return policyPromise;
};

/**
 * Check if node server is up
 */
var _isNodeServerUp = function (callback) {
	ps.lookup({
		command: 'node'
	}, function (err, resultList) {
		if (err) {
			console.log('ERROR: ' + err);
			return callback(false);
		}

		var result = false;
		resultList.forEach(function (process) {
			if (process) {
				// console.log('PID: %s, COMMAND: %s, ARGUMENTS: %s', process.pid, process.command, process.arguments);
				if (process.command === 'node' && JSON.stringify(process.arguments).indexOf('test/server.js') >= 0) {
					result = true;
				}
			}
		});
		//console.log('_isNodeServerUp: result=' + result);
		callback(result);
	});
};

module.exports.isNodeServerUp = function () {
	"use strict";
	return _isNodeServerUp();
};


module.exports.getDocumentRendition = function (app, doc, callback) {
	var url = '';

	if (!app.locals.connectToServer) {
		console.log(' - No remote server to get document rendition');
		return;
	}

	var client = new Client(),
		docname = doc.name,
		resturl = 'http://localhost:' + app.locals.port + '/documents/api/1.2/folders/search/items?fulltext=' + encodeURIComponent(docname);
	// console.log(' -- get document id ');

	client.get(resturl, function (data, response) {
		if (response && response.statusCode === 200) {
			if (data && data.totalCount > 0) {
				var docobj
				for (var j = 0; j < data.items.length; j++) {
					if (data.items[j].name && data.items[j].name.indexOf(docname) === 0) {
						docobj = data.items[j];
						break;
					}
				}
				if (!docobj) {
					console.log(' -- failed to get metadata for ' + docname);
					doc.valid = false;
					callback(doc);
				} else {
					doc.valid = true;
					doc.id = docobj.id;
				}
				docname = docobj.name;

				// check of the rendition exists
				var page = 'page1';
				resturl = 'http://localhost:' + app.locals.port + '/documents/api/1.2/files/' + doc.id + '/data/rendition?rendition=' + page;
				// console.log(' -- get document rendition');
				client.get(resturl, function (data, response) {
					if (response && response.statusCode === 200) {
						console.log(' -- rendition exists, doc: ' + docname + ' page: ' + page);
						doc.renditionReady = true;
						callback(doc);
					} else {
						console.log(' -- no rendition for ' + docname + '/' + page + ' yet. Creating...');
						// create redition
						resturl = 'http://localhost:' + app.locals.port + '/documents/api/1.2/files/' + doc.id + '/pages';
						var args = {
							data: {
								IsJson: 1
							},
							headers: {
								'Authorization': "Basic " + btoa(app.locals.server.username + ":" + app.locals.server.password)
							}
						};
						client.post(resturl, function (data, response) {
							doc.finished = true;
							if (response && response.statusCode === 200) {
								setTimeout(function () {
									// waiting rendition to be created
									console.log(' -- rendition created, doc: ' + docname);
									url = '/documents/web?IdcService=GET_RENDITION&AuxRenditionType=system&item=fFileGUID:' + doc.id + '&Rendition=' + page;
									doc.renditionReady = true;
									callback(doc);
								}, 3000); // 3 second
							} else {
								console.log(' -- failed to create rendition: ' + response.statusCode);
								doc.renditionReady = false;
								callback(doc);
							}
						});
					}
				});
			} else {
				console.log(' -- no document found with name ' + docname);
				doc.valid = false;
				callback(doc)
			}
		} else {
			console.log(' -- failed to get metadata for ' + docname);
			doc.valid = false;
			callback(doc);
		}
	});

};

/**
 * Get custom components associated with a theme
 * @param {*} themeName 
 */
module.exports.getThemeComponents = function (projectDir, themeName) {
	_setupSourceDir(projectDir);

	var componentsjsonfile = path.join(themesDir, themeName, 'components.json'),
		themeComps = [],
		comps = [];
	if (fs.existsSync(componentsjsonfile)) {
		var str = fs.readFileSync(componentsjsonfile).toString().trim(),
			filecontent = str ? JSON.parse(str) : [];
		if (filecontent && !Array.isArray(filecontent)) {
			themeComps = filecontent.components || [];
		} else {
			themeComps = filecontent;
		}
		themeComps.forEach(function (comp) {
			if (comp.list && comp.list.length > 0) {
				comp.list.forEach(function (listcomp) {
					if (listcomp.themed) {
						comps.push({
							id: listcomp.id,
							type: listcomp.type,
							category: comp.name
						});
					}
				});
			}
		});
	} else {
		// console.log(' - file ' + componentsjsonfile + ' does not exist');
	}
	// console.log(comps);
	return comps;
};


/**
 * Upload a local file to the personal folder on the server
 * @param {*} filePath 
 */
module.exports.uploadFileToServer = function (request, server, folderPath, filePath) {
	"use strict";

	var fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

	var folder = folderPath;
	if (folder && folder.charAt(0) === '/') {
		folder = folder.substring(1);
	}
	if (folder && folder.charAt(folder.length - 1) === '/') {
		folder = folder.substring(0, folder.length - 1);
	}

	var uploadPromise = new Promise(function (resolve, reject) {

		var dUser = '';
		var idcToken;

		var express = require('express');
		var app = express();

		var port = '9393';
		var localhost = 'http://localhost:' + port;

		var auth = _getRequestAuth(server);

		app.get('/documents/web', function (req, res) {
			// console.log('GET: ' + req.url);
			var url = server.url + req.url;
			var options = {
				url: url,
				'auth': auth
			};

			request(options).on('response', function (response) {
					// fix headers for cross-domain and capitalization issues
					_fixHeaders(response, res);
				})
				.on('error', function (err) {
					console.log(err);
					res.write({
						err: err
					});
					res.end();
				})
				.pipe(res);
		});
		app.post('/documents/web', function (req, res) {
			// console.log('POST: ' + req.url);
			if (req.url.indexOf('CHECKIN_UNIVERSAL') > 0) {
				var params = _getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
				var fileId = params.fileId;
				var filePath = params.filePath;
				var fileName = params.fileName;
				var folderId = params.folderId;
				var uploadUrl = server.url + '/documents/web?IdcService=CHECKIN_UNIVERSAL';
				var formData = {
					'parent': 'fFolderGUID:' + folderId,
					'idcToken': idcToken,
					'primaryFile': fs.createReadStream(filePath),
					'filename': fileName
				};
				if (fileId && fileId !== 'undefined') {
					formData['item'] = 'fFileGUID:' + fileId;
				}
				var postData = {
					method: 'POST',
					url: uploadUrl,
					'auth': auth,
					'formData': formData
				};
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						_fixHeaders(response, res);
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - upload finished: '+filePath);
						res.end();
					});

			}
		});

		var localServer = app.listen(0, function () {
			port = localServer.address().port;
			localhost = 'http://localhost:' + port;
			// console.log(' - listening on port: '  + port);

			// get the personal folder id
			var folderUrl = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';
			var options = {
				url: folderUrl
			};

			request.get(options, function (err, response, body) {
				if (err) {
					console.log('ERROR: Failed to get user id ');
					console.log(err);
					_closeServer(localServer);
					return resolve({
						err: 'err'
					});
				}
				if (response && response.statusCode === 200) {
					var data = JSON.parse(body);
					dUser = data && data.LocalData && data.LocalData.dUser;
					idcToken = data && data.LocalData && data.LocalData.idcToken;
					var folderId = 'F:USER:' + dUser;
					// console.log(' - folder id: ' + folderId + ' idcToken: ' + idcToken);

					var queryFolderPromise = _queryFolderId(request, server, localhost, folder);
					queryFolderPromise.then(function (result) {
						if (result.err) {
							_closeServer(localServer);
							return resolve({
								err: 'err'
							});
						}
						folderId = result.folderId || folderId;

						// check if the file exists 
						var filesUrl = localhost + '/documents/web?IdcService=FLD_BROWSE&itemType=File&IsJson=1&item=fFolderGUID:' + folderId;

						options.url = filesUrl;
						var fileId;
						request.get(options, function (err, response, body) {
							if (err) {
								_closeServer(localServer);
								console.log('ERROR: Failed to get personal files');
								console.log(err);
								return resolve({
									err: 'err'
								});
							}

							var data;
							try {
								data = JSON.parse(body);
							} catch (e) {}

							if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
								console.log('ERROR: Failed to get personal files ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
								_closeServer(localServer);
								return resolve({
									err: 'err'
								});
							}

							var dRoleName = data.LocalData.dRoleName;
							if (dRoleName !== 'owner' && dRoleName !== 'manager' && dRoleName !== 'contributor') {
								console.log('ERROR: no permission to upload to ' + (folder ? 'folder ' + folder : 'home folder'));
								_closeServer(localServer);
								return resolve({
									err: 'err'
								});
							}

							fileId = _getFileIdFromResultSets(data, fileName);
							var folderId = _getFolderIdFromFolderInfo(data) || ('F:USER:' + dUser);
							// console.log('folder: ' + (folder ? folder : 'home') + ' id: ' + folderId);

							// now upload the file
							var uploadUrl = localhost + '/documents/web?IdcService=CHECKIN_UNIVERSAL';
							uploadUrl += '&folderId=' + folderId + '&fileId=' + fileId + '&filePath=' + filePath + '&fileName=' + fileName;

							request.post(uploadUrl, function (err, response, body) {
								if (err) {
									_closeServer(localServer);
									console.log('ERROR: Failed to upload');
									console.log(err);
									return resolve({
										err: 'err'
									});
								}
								if (response && response.statusCode === 200) {
									var data = JSON.parse(body);
									var version = data && data.LocalData && data.LocalData.dRevLabel;
									console.log(' - file ' + fileName + ' uploaded to ' + (folder ? 'folder ' + folder : 'home folder') + ', version ' + version);
									localServer.close(function () {
										//console.log(' - close local server: ' + port);
										return resolve(data);
									});
								} else {
									_closeServer(localServer);
									console.log(' - failed to upload: ' + response.statusCode);
									return resolve({
										err: 'err'
									});
								}
							}); // checkin request
						}); // query file id
					}); // query folder id
				}
			}); // get user id
		}); // local server
	});
	return uploadPromise;
};


/**
 * Get the attribute of a component
 * @param data the result from API SCS_BROWSE_APPS or SCS_ACTIVATE_COMPONENT
 * @param fieldName
 */
module.exports.getComponentAttribute = function (data, fieldName) {
	return _getComponentAttribute(data, fieldName);
};
var _getComponentAttribute = function (data, fieldName) {
	var compAttr;
	var appInfo = data && data.ResultSets && data.ResultSets.AppInfo;
	if (appInfo && appInfo.rows.length > 0) {
		var fieldIdx = -1;
		var fields = appInfo.fields;
		for (var i = 0; i < fields.length; i++) {
			if (fields[i].name === fieldName) {
				fieldIdx = i;
				break;
			}
		}
		if (fieldIdx >= 0 && fieldIdx < appInfo.rows[0].length) {
			compAttr = appInfo.rows[0][fieldIdx];
		}
	}
	return compAttr;
};

/**
 * Import a template with the zip file
 * @param fileId
 * @param idcToken
 */
module.exports.importTemplateToServer = function (request, server, fileId, idcToken) {
	"use strict";

	var importPromise = new Promise(function (resolve, reject) {
		var importUrl = server.url + '/documents/web?IdcService=SCS_IMPORT_TEMPLATE_PACKAGE';
		var data = {
			'item': 'fFileGUID:' + fileId,
			'idcToken': idcToken,
			'useBackgroundThread': true,
			'ThemeConflictResolution': 'overwrite',
			'TemplateConflictResolution': 'overwrite',
			'DefaultComponentConflictResolution': true,
			'allowCrossTenant': true
		};
		var postData = {
			'form': data
		};

		request.post(importUrl, postData, function (err, response, body) {
			if (err) {
				return resolve({
					'err': err
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				// console.log('ERROR: Failed to import template ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve(data);
			}

			var jobId = data.LocalData.JobID;
			var importStatusPromise = _getTemplateImportStatus(request, server.url, jobId);
			importStatusPromise.then(function (statusResult) {
				resolve(statusResult);
			});
		});
	});

	return importPromise;
};

/**
 * Import a component with the zip on the dev server
 * @param fileId
 * @param idcToken
 */
module.exports.importComponentToServer = function (request, server, fileId, idcToken) {
	"use strict";

	var importPromise = new Promise(function (resolve, reject) {
		var importUrl = server.url + '/documents/web?IdcService=SCS_IMPORT_COMPONENT';
		var data = {
			'item': 'fFileGUID:' + fileId,
			'idcToken': idcToken,
			'ComponentConflictResolution': 'overwrite'
		};
		var postData = {
			'form': data
		};

		request.post(importUrl, postData, function (err, response, body) {
			if (err) {
				return resolve({
					'err': err
				});
			}

			var data = JSON.parse(body);
			return resolve(data);
		});
	});

	return importPromise;
};

/**
 * Publish a component on the dev server
 * @param fileId
 * @param idcToken
 */
module.exports.publishComponentOnServer = function (request, server, componentFolderGUID, idcToken) {
	"use strict";

	var publishPromise = new Promise(function (resolve, reject) {
		var publishUrl = server.url + '/documents/web?IdcService=SCS_ACTIVATE_COMPONENT';
		var data = {
			'item': 'fFolderGUID:' + componentFolderGUID,
			'idcToken': idcToken
		};
		var postData = {
			'form': data
		};

		request.post(publishUrl, postData, function (err, response, body) {
			if (err) {
				return resolve({
					'err': err
				});
			}

			var data = JSON.parse(body);
			return resolve(data);
		});
	});

	return publishPromise;
};

var _loginToDevServer = function (server, request) {
	var loginPromise = new Promise(function (resolve, reject) {
		// open user session
		request.post(server.url + '/cs/login/j_security_check', {
			form: {
				j_character_encoding: 'UTF-8',
				j_username: server.username,
				j_password: server.password
			}
		}, function (err, resp, body) {
			if (err) {
				console.log(' - Failed to login to ' + server.url);
				return resolve({
					'status': false
				});
			}
			// we expect a 303 response
			if (resp && resp.statusCode === 303) {
				var location = server.url + '/adfAuthentication?login=true';

				request.get(location, function (err, response, body) {
					if (err) {
						console.log(' - failed to login to ' + server.url);
						return resolve({
							'status': false
						});
					}

					if (!loginReported) {
						console.log(' - Logged in to remote server: ' + server.url);
						loginReported = true;
					}
					return resolve({
						'status': true
					});
				});
			} else {
				return resolve({
					'status': false
				});
			}
		});
	});
	return loginPromise;
};
module.exports.loginToDevServer = _loginToDevServer;

var _loginToPODServer = function (server) {
	if (server.sso) {
		return _loginToSSOServer(server);
	}
	var loginPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents',
			usernameid = '#idcs-signin-basic-signin-form-username',
			passwordid = '#idcs-signin-basic-signin-form-password',
			submitid = '#idcs-signin-basic-signin-form-submit',
			username = server.username,
			password = server.password;
		/* jshint ignore:start */
		var browser;
		async function loginServer() {
			try {
				browser = await puppeteer.launch({
					ignoreHTTPSErrors: true,
					headless: false
				});
				const page = await browser.newPage();
				await page.setViewport({
					width: 960,
					height: 768
				});

				await page.goto(url);

				await page.waitForSelector(usernameid);
				await page.type(usernameid, username);

				await page.waitForSelector(passwordid);
				await page.type(passwordid, password);

				var button = await page.waitForSelector(submitid);
				await button.click();

				try {
					await page.waitForSelector('#content-wrapper', {
						timeout: 12000
					});
				} catch (err) {
					// will continue, in headleass mode, after login redirect does not occur
				}

				// get OAuth token
				var tokenurl = server.url + '/documents/web?IdcService=GET_OAUTH_TOKEN';
				await page.goto(tokenurl);
				try {
					await page.waitForSelector('pre', {
						timeout: 120000
					});
				} catch (err) {
					console.log('Failed to connect to the server to get the OAuth token the first time');

					await page.goto(tokenurl);
					try {
						await page.waitForSelector('pre'); // smaller timeout
					} catch (err) {
						console.log('Failed to connect to the server to get the OAuth token the second time');

						await browser.close();
						return resolve({
							'status': false
						});
					}
				}

				var result = await page.evaluate(() => document.querySelector('pre').textContent);
				var token = '';
				if (result) {
					var localdata = JSON.parse(result);
					token = localdata && localdata.LocalData && localdata.LocalData.tokenValue;
				}
				// console.log('OAuth token=' + token);

				server.oauthtoken = token;

				await browser.close();

				if (!token || token.toLowerCase().indexOf('error') >= 0) {
					console.log('ERROR: failed to get the OAuth token');
					return resolve({
						'status': false
					});
				}

				console.log(' - connect to remote server: ' + server.url);

				return resolve({
					'status': true
				});

			} catch (err) {
				console.log('ERROR: failed to connect to the server');
				console.log(err);
				if (browser) {
					await browser.close();
				}
				return resolve({
					'status': false
				});
			}
		}
		loginServer();
		/* jshint ignore:end */
	});
	return loginPromise;
};
module.exports.loginToPODServer = _loginToPODServer;

var _loginToSSOServer = function (server) {
	var loginPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents',
			usernameid = '#sso_username',
			passwordid = '#ssopassword',
			submitid = '.submit_btn',
			username = server.username,
			password = server.password;
		/* jshint ignore:start */
		var browser;
		async function loginServer() {
			try {
				browser = await puppeteer.launch({
					ignoreHTTPSErrors: true,
					headless: false
				});
				const page = await browser.newPage();
				await page.setViewport({
					width: 960,
					height: 768
				});

				await page.goto(url);

				await page.waitForSelector(usernameid);
				await page.type(usernameid, username);

				await page.waitForSelector(passwordid);
				await page.type(passwordid, password);

				var button = await page.waitForSelector(submitid);
				await button.click();

				try {
					await page.waitForSelector('#content-wrapper', {
						timeout: 12000
					});
				} catch (err) {
					// will continue, in headleass mode, after login redirect does not occur
				}

				// get OAuth token
				var tokenurl = server.url + '/documents/web?IdcService=GET_OAUTH_TOKEN';
				await page.goto(tokenurl);
				try {
					await page.waitForSelector('pre', {
						timeout: 120000
					});
				} catch (err) {
					console.log('Failed to connect to the server to get the OAuth token the first time');

					await page.goto(tokenurl);
					try {
						await page.waitForSelector('pre'); // smaller timeout
					} catch (err) {
						console.log('Failed to connect to the server to get the OAuth token the second time');

						await browser.close();
						return resolve({
							'status': false
						});
					}
				}

				var result = await page.evaluate(() => document.querySelector('pre').textContent);
				var token = '';
				if (result) {
					var localdata = JSON.parse(result);
					token = localdata && localdata.LocalData && localdata.LocalData.tokenValue;
				}
				// console.log('OAuth token=' + token);

				server.oauthtoken = token;

				await browser.close();

				if (!token || token.toLowerCase().indexOf('error') >= 0) {
					console.log('ERROR: failed to get the OAuth token');
					return resolve({
						'status': false
					});
				}

				console.log(' - connect to remote server: ' + server.url);

				return resolve({
					'status': true
				});

			} catch (err) {
				console.log('ERROR: failed to connect to the server');
				console.log(err);
				if (browser) {
					await browser.close();
				}
				return resolve({
					'status': false
				});
			}
		}
		loginServer();
		/* jshint ignore:end */
	});
	return loginPromise;
};
module.exports.loginToSSOServer = _loginToSSOServer;

module.exports.loginToServer = function (server, request) {
	return _loginToServer(server, request);
};
var _loginToServer = function (server, request) {
	var env = server.env || 'pod_ec';
	var loginPromise = env === 'dev_osso' ? _loginToSSOServer(server) : (env === 'dev_ec' ? _loginToDevServer(server, request) : _loginToPODServer(server));
	return loginPromise;
};

/**
 * Upload a local file to the personal folder on the server
 * @param server the server info
 * @param type template or component
 * @param filePath 
 */
module.exports.importToPODServer = function (server, type, folder, imports, publishComponent) {
	"use strict";

	var importPromise = new Promise(function (resolve, reject) {
		var filePath;
		var fileName;
		var objectName;
		var dUser = '';
		var idcToken;
		var fileId = '';
		var importedFileId;
		var importedCompFolderId;

		var express = require('express');
		var app = express();
		var request = require('request');
		request = request.defaults({
			headers: {
				connection: 'keep-alive'
			},
			pool: {
				maxSockets: 50
			},
			jar: true,
			proxy: null
		});

		var port = '8181';
		var localhost = 'http://localhost:' + port;

		var params, url;

		app.get('/documents/web', function (req, res) {
			// console.log('GET: ' + req.url);
			var url = server.url + req.url;
			var options = {
				url: url,
				'auth': {
					bearer: server.oauthtoken
				}
			};

			request(options).on('response', function (response) {
					// fix headers for cross-domain and capitalization issues
					_fixHeaders(response, res);
				})
				.on('error', function (err) {
					console.log(err);
					res.write({
						err: err
					});
					res.end();
				})
				.pipe(res);
		});
		app.post('/documents/web', function (req, res) {
			// console.log('POST: ' + req.url);
			if (req.url.indexOf('CHECKIN_UNIVERSAL') > 0) {
				var params = _getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
				fileId = params.fileId;
				filePath = params.filePath;
				fileName = params.fileName;
				var folderId = params.folderId;
				var uploadUrl = server.url + '/documents/web?IdcService=CHECKIN_UNIVERSAL';
				var formData = {
					'parent': 'fFolderGUID:' + folderId,
					'idcToken': idcToken,
					'primaryFile': fs.createReadStream(filePath),
					'filename': fileName
				};
				if (fileId && fileId !== 'undefined') {
					formData['item'] = 'fFileGUID:' + fileId;
				}
				var postData = {
					method: 'POST',
					url: uploadUrl,
					'auth': {
						bearer: server.oauthtoken
					},
					'formData': formData
				};
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						_fixHeaders(response, res);
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - upload finished: '+filePath);
						res.end();
					});

			} else if (req.url.indexOf('SCS_IMPORT_TEMPLATE_PACKAGE') > 0) {
				var params = _getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
				importedFileId = params.importedFileId;
				var importUrl = server.url + '/documents/web?IdcService=SCS_IMPORT_TEMPLATE_PACKAGE';
				var data = {
					'item': 'fFileGUID:' + importedFileId,
					'idcToken': idcToken,
					'useBackgroundThread': true,
					'ThemeConflictResolution': 'overwrite',
					'TemplateConflictResolution': 'overwrite',
					'DefaultComponentConflictResolution': true,
					'allowCrossTenant': true
				};
				var postData = {
					method: 'POST',
					url: importUrl,
					'auth': {
						bearer: server.oauthtoken
					},
					'form': data
				};
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						_fixHeaders(response, res);
					})
					.on('error', function (err) {
						res.write({
							err: err
						});
						res.end();
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - template import finished');
						res.end();
					});

			} else if (req.url.indexOf('SCS_IMPORT_COMPONENT') > 0) {
				var params = _getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
				importedFileId = params.importedFileId;
				var importCompUrl = server.url + '/documents/web?IdcService=SCS_IMPORT_COMPONENT';
				var data = {
					'item': 'fFileGUID:' + importedFileId,
					'idcToken': idcToken,
					'ComponentConflictResolution': 'overwrite'
				};
				var postData = {
					method: 'POST',
					url: importCompUrl,
					'auth': {
						bearer: server.oauthtoken
					},
					'form': data
				};
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						_fixHeaders(response, res);
					})
					.on('error', function (err) {
						res.write({
							err: err
						});
						res.end();
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - component import finished');
						res.end();
					});
			} else if (req.url.indexOf('SCS_ACTIVATE_COMPONENT') > 0) {
				var params = _getURLParameters(req.url.substring(req.url.indexOf('?') + 1));
				importedCompFolderId = params.importedCompFolderId;
				var publishCompUrl = server.url + '/documents/web?IdcService=SCS_ACTIVATE_COMPONENT';
				var data = {
					'item': 'fFolderGUID:' + importedCompFolderId,
					'idcToken': idcToken
				};
				var postData = {
					method: 'POST',
					url: publishCompUrl,
					'auth': {
						bearer: server.oauthtoken
					},
					'form': data
				};
				request(postData).on('response', function (response) {
						// fix headers for cross-domain and capitalization issues
						_fixHeaders(response, res);
					})
					.on('error', function (err) {
						res.write({
							err: err
						});
						res.end();
					})
					.pipe(res)
					.on('finish', function (err) {
						// console.log(' - component publish finished');
						res.end();
					});
			}
		});
		var socketNum = 0;
		var localServer = app.listen(0, function () {
			port = localServer.address().port;
			localhost = 'http://localhost:' + port;
			// console.log(' - start ' + localhost + ' for import...');
			console.log(' - establishing user session');
			var total = 0;
			var inter = setInterval(function () {
				// console.log(' - getting login user: ' + total);
				var url = localhost + '/documents/web?IdcService=SCS_GET_TENANT_CONFIG';

				request.get(url, function (err, response, body) {
					var data;
					try {
						data = JSON.parse(body);
					} catch (e) {}

					dUser = data && data.LocalData && data.LocalData.dUser;
					idcToken = data && data.LocalData && data.LocalData.idcToken;
					if (dUser && dUser !== 'anonymous' && idcToken) {
						// console.log(' - dUser: ' + dUser + ' idcToken: ' + idcToken);
						clearInterval(inter);
						_import();
					}
					total += 1;
					if (total >= 10) {
						clearInterval(inter);
						_closeServer(localServer);
						console.log('ERROR: disconnect from the server, try again');
						return resolve({});
					}
				});
			}, 6000);

			var _import = function () {
				var queryFolderPromise = _queryFolderId(request, server, localhost, folder);
				queryFolderPromise.then(function (result) {
					if (result.err) {
						_closeServer(localServer);
						return resolve({
							err: 'err'
						});
					}
					var folderId = result.folderId || ('F:USER:' + dUser);

					var url = localhost + '/documents/web?IdcService=FLD_BROWSE&itemType=File&item=fFolderGUID:' + folderId;

					request.get(url, function (err, response, body) {
						if (err) {
							_closeServer(localServer);
							console.log('ERROR: Failed to get personal files ');
							console.log(err);
							return resolve({});
						}
						var data;
						try {
							data = JSON.parse(body);
						} catch (e) {}

						if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
							_closeServer(localServer);
							console.log('ERROR: Failed to get personal files ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
							return resolve({
								err: 'err'
							});
						}

						var dRoleName = data.LocalData.dRoleName;
						if (dRoleName !== 'owner' && dRoleName !== 'manager' && dRoleName !== 'contributor') {
							_closeServer(localServer);
							console.log('ERROR: no permission to upload to ' + (folder ? 'folder ' + folder : 'home folder'));
							return resolve({
								err: 'err'
							});
						}

						// upload the file
						var importsPromise = [];
						var folderId = _getFolderIdFromFolderInfo(data) || ('F:USER:' + dUser);
						// console.log('folder: ' + (folder ? folder : 'home') + ' id: ' + folderId);

						for (var i = 0; i < imports.length; i++) {
							fileId = _getFileIdFromResultSets(data, fileName);
							filePath = imports[i].zipfile;
							objectName = imports[i].name;
							fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
							fileId = _getFileIdFromResultSets(data, fileName);
							// console.log('fileName: ' + fileName + ' fileId: ' + fileId);

							importsPromise[i] = _importOneObjectToPodServer(localhost, request, type, objectName, folder, folderId, fileId, filePath, publishComponent);
						}

						// Execute parallelly
						Promise.all(importsPromise).then(function (values) {
							_closeServer(localServer);
							// All done
							resolve({});
						});
					}); // query file
				}); // query folder
			}; // _import
		});
		localServer.setTimeout(0);

	});

	return importPromise;
};

var _timeUsed = function (start, end) {
	var timeDiff = end - start; //in ms
	// strip the ms
	timeDiff /= 1000;

	// get seconds 
	var seconds = Math.round(timeDiff);
	return seconds.toString() + 's';
};

var _importOneObjectToPodServer = function (localhost, request, type, name, folder, folderId, fileId, filePath, publishComponent) {
	var importOnePromise = new Promise(function (resolve, reject) {
		var startTime;

		// Upload the zip file first
		var fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
		var url = localhost + '/documents/web?IdcService=CHECKIN_UNIVERSAL';
		url += '&folderId=' + folderId + '&fileId=' + fileId + '&filePath=' + filePath + '&fileName=' + fileName;
		startTime = new Date();
		request.post(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to upload ' + filePath);
				console.log(err);
				return resolve({});
			}
			if (response && response.statusCode === 200) {
				var data = JSON.parse(body);
				var version = data && data.LocalData && data.LocalData.dRevLabel;
				var uploadedFileName = data && data.LocalData && data.LocalData.dOriginalName;
				console.log(' - file ' + uploadedFileName + ' uploaded to ' + (folder ? 'folder ' + folder : 'home folder') + ', version ' + version + ' (' + _timeUsed(startTime, new Date()) + ')');
				var importedFileId = data && data.LocalData && data.LocalData.fFileGUID;

				// import
				if (importedFileId) {
					if (type === 'template') {
						url = localhost + '/documents/web?IdcService=SCS_IMPORT_TEMPLATE_PACKAGE';
					} else {
						url = localhost + '/documents/web?IdcService=SCS_IMPORT_COMPONENT';
					}
					url += '&importedFileId=' + importedFileId;
					startTime = new Date();
					request.post(url, function (err, response, body) {
						var data;
						try {
							data = JSON.parse(body);
						} catch (e) {}
						if (!data || data.err || !data.LocalData || data.LocalData.StatusCode !== '0') {
							console.log(' - failed to import  ' + (data && data.LocalData ? ('- ' + data.LocalData.StatusMessage) : err));
							return resolve({});
						}

						if (type === 'template') {
							var jobId = data.LocalData.JobID;
							var importTempStatusPromise = _getTemplateImportStatus(request, localhost, jobId);
							importTempStatusPromise.then(function (data) {
								if (data && data.LocalData) {
									if (data.LocalData.StatusCode !== '0') {
										console.log(' - failed to import ' + name + ': ' + importResult.LocalData.StatusMessage);
									} else if (data.LocalData.ImportConflicts) {
										console.log(data.LocalData);
										console.log(' - failed to import ' + name + ': the template already exists and you do not have privilege to override it');
									} else {
										console.log(' - template ' + name + ' imported (' + _timeUsed(startTime, new Date()) + ')');
									}
								}
								return resolve({});
							});
						} else {
							console.log(' - finished import component');
							//
							// Process import component result
							//
							if (data && data.LocalData) {
								if (data.LocalData.StatusCode !== '0') {
									console.log(' - failed to import ' + name + ': ' + data.LocalData.StatusMessage);
									return resolve({});
								} else if (data.LocalData.ImportConflicts) {
									console.log(' - failed to import ' + name + ': the component already exists and you do not have privilege to override it');
									return resolve({});
								} else {
									console.log(' - component ' + name + ' imported (' + _timeUsed(startTime, new Date()) + ')');
									var importedCompFolderId = _getComponentAttribute(data, 'fFolderGUID');

									if (publishComponent && importedCompFolderId) {
										// publish the imported component
										url = localhost + '/documents/web?IdcService=SCS_ACTIVATE_COMPONENT';
										url += '&importedCompFolderId=' + importedCompFolderId;
										startTime = new Date();
										request.post(url, function (err, response, body) {
											if (err) {
												console.log(' - failed to publish ' + name + ': ' + err);
												return resolve({});
											}
											if (response.statusCode !== 200) {
												console.log(' - failed to publish ' + name + ': status code ' + response.statusCode + ' ' + response.statusMessage);
												return resolve({});
											}
											var publishResult = JSON.parse(body);
											if (publishResult.err) {
												console.log(' - failed to import ' + name + ': ' + err);
												return resolve({});
											}
											if (publishResult.LocalData && publishResult.LocalData.StatusCode !== '0') {
												console.log(' - failed to publish: ' + publishResult.LocalData.StatusMessage);
											} else {
												console.log(' - component ' + name + ' published (' + _timeUsed(startTime, new Date()) + ')');
											}
											return resolve({});
										});
									} else {
										return resolve({});
									}
								}
							} else {
								console.log(' - failed to import ' + name);
								return resolve({});
							}
						}
					});
				} else {
					console.log('ERROR: Failed to upload ' + filePath);
					return resolve({});
				}
			} else {
				console.log(' - failed to upload ' + filePath + ': ' + response && response.statusCode);
				return resolve({});
			}
		});
	});

	return importOnePromise;
};

/**
 * Use API FLD_BROWSE to get child folders
 * @param {*} request 
 * @param {*} server 
 * @param {*} host 
 * @param {*} folerId 
 */
function _browseFolder(request, server, host, folderId, folderName) {
	var foldersPromise = new Promise(function (resolve, reject) {
		var url = host + '/documents/web?IdcService=FLD_BROWSE&itemType=Folder&item=fFolderGUID:' + folderId;
		var options = {
			url: url
		};
		if (server.env !== 'dev_ec') {
			options['auth'] = {
				bearer: server.oauthtoken
			};
		}

		request.get(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: failed to query folder ' + folderName);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: failed to query folder ' + folderName);
				return resolve({
					err: 'err'
				});
			}

			resolve(data);

		});
	});
	return foldersPromise;
}

/**
 * Get the id of the last folder in the folder path folder1/folder2/.../folder[n]
 * @param {*} request 
 * @param {*} server 
 * @param {*} host 
 * @param {*} folderPath 
 */
module.exports.queryFolderId = function (request, server, host, folderPath) {
	return _queryFolderId(request, server, host, folderPath);
};

var _queryFolderId = function (request, server, host, folderPath) {
	var folderIdPromise = new Promise(function (resolve, reject) {

		var folderNames = folderPath ? folderPath.split('/') : [];

		// First query user personal folder home
		var url = host + '/documents/web?IdcService=FLD_BROWSE_PERSONAL&itemType=Folder';
		var options = {
			url: url
		};
		if (server.env !== 'dev_ec') {
			options['auth'] = {
				bearer: server.oauthtoken
			};
		}
		request.get(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: failed to query home folder');
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: failed to query home folder');
				return resolve({
					err: 'err'
				});
			}

			if (!folderPath) {
				// the personal home folder GUID
				return resolve({
					folderId: data.LocalData.OwnerFolderGUID
				});
			}

			// The top folder
			var folderId = _getFolderIdFromResultSets(data, folderNames[0]);

			if (!folderId) {
				console.log('ERROR: folder ' + folderNames[0] + ' does not exist');
				return resolve({
					err: 'err'
				});
			}

			if (folderNames.length === 1) {
				return resolve({
					folderId: folderId
				});
			}

			var folderName = folderNames[0];

			// Varify and get sub folders 
			/* jshint ignore:start */
			async function _querysubFolders(request, server, host, parentFolderId, folderNames) {
				var id = parentFolderId,
					name = folderNames[0];
				// console.log('Folder: ' + folderNames[0] + ' id: ' + parentFolderId);
				for (var i = 1; i < folderNames.length; i++) {
					var result = await _browseFolder(request, server, host, id, name);
					if (result.err) {
						return ({
							err: 'err'
						});
					}
					id = _getFolderIdFromResultSets(result, folderNames[i]);
					if (!id) {
						console.log('ERROR: folder ' + folderNames[i] + ' does not exist');
						return ({
							err: 'err'
						});
					}
					// console.log('Folder: ' + folderNames[i] + ' id: ' + id);
					name = folderNames[i];
				}
				return ({
					folderId: id
				});
			};
			_querysubFolders(request, server, host, folderId, folderNames).then((result) => {
				if (result.err) {
					return resolve({
						err: 'err'
					});
				}
				return resolve(result);
			});
			/* jshint ignore:end */

		});

	});
	return folderIdPromise;
};

/** 
 * Get the file id with the file name
 * @param data the JSON result from FLD_BROWSER
 * @param fileName the file name to match
 */
var _getFileIdFromResultSets = function (data, fileName) {
	var fileId = '';
	if (data && data.LocalData && data.LocalData.TotalChildFilesCount > 0) {
		var files = data.ResultSets && data.ResultSets.ChildFiles;
		var fFileGUIDIdx, fFileNameIdx;
		for (var i = 0; i < files.fields.length; i++) {
			if (files.fields[i].name === 'fFileGUID') {
				fFileGUIDIdx = i;
			} else if (files.fields[i].name === 'fFileName') {
				fFileNameIdx = i;
			}
			if (fFileGUIDIdx && fFileNameIdx) {
				break;
			}
		}
		for (var i = 0; i < files.rows.length; i++) {
			var obj = files.rows[i];
			if (obj[fFileNameIdx] === fileName) {
				fileId = obj[fFileGUIDIdx];
				// console.log(' - File ' + fileName + ' exists, ID: ' + fileId);
				break;
			}
		}
	}
	return fileId;
};

/** 
 * Get the folder id from FolderInfo
 * @param data the JSON result from FLD_BROWSER
 */
var _getFolderIdFromFolderInfo = function (data) {
	var folderId = '';
	if (data && data.ResultSets && data.ResultSets.FolderInfo) {
		var folderInfo = data.ResultSets.FolderInfo;
		for (var i = 0; i < folderInfo.fields.length; i++) {
			if (folderInfo.fields[i].name === 'fFolderGUID') {
				folderId = folderInfo.rows[0][i];
				break;
			}
		}
	}
	return folderId;
};

/**
 * Get the id of a folder in the browse result with a specific name
 * @param {*} data the JSON result from FLD_BROWSER
 * @param {*} folderName 
 */
var _getFolderIdFromResultSets = function (data, folderName) {
	var result;

	var folders = data && data.ResultSets && data.ResultSets.ChildFolders && data.ResultSets.ChildFolders.rows;
	if (!folders || folders.length === 0) {
		return result;
	}
	var fields = data.ResultSets.ChildFolders.fields;
	var fFolderGUIDIdx, fFolderNameIdx;
	var i;
	for (i = 0; i < fields.length; i++) {
		if (fields[i].name === 'fFolderName') {
			fFolderNameIdx = i;
		} else if (fields[i].name === 'fFolderGUID') {
			fFolderGUIDIdx = i;
		}
	}

	var folderId;
	for (i = 0; i < folders.length; i++) {
		if (folders[i][fFolderNameIdx] === folderName) {
			folderId = folders[i][fFolderGUIDIdx];
			break;
		}
	}

	return folderId;
};

var _getRequest = function () {
	var request = require('request');
	request = request.defaults({
		headers: {
			connection: 'keep-alive'
		},
		pool: {
			maxSockets: 50
		},
		jar: true,
		proxy: null
	});
	return request;
};
var _getSiteInfo = function (server, site) {
	var sitesPromise = new Promise(function (resolve, reject) {
		'use strict';

		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({
				err: 'no server is configured'
			});
		}

		var request = _getRequest();

		var loginPromises = [];
		if (!server.login) {
			loginPromises.push(_loginToServer(server, request));
		}
		Promise.all(loginPromises).then(function (result) {
			var auth = _getRequestAuth(server);

			var options = {
				url: server.url + '/documents/web?IdcService=SCS_GET_SITE_INFO_FILE&siteId=' + site + '&IsJson=1',
				auth: auth
			};

			request.get(options, function (err, response, body) {
				if (err) {
					console.log('ERROR: Failed to get site Id');
					console.log(err);
					return resolve({
						'err': err
					});
				}
				var data = body;
				if (typeof data === 'string') {
					try {
						data = JSON.parse(body);
					} catch (e) {}
				}

				var siteInfo = data && (data.properties || data.base.properties);
				if (!siteInfo) {
					console.log('ERROR: Failed to get site info for - ' + site);
					return resolve({
						err: 'err'
					});
				}

				// get the site info 
				return resolve({
					siteInfo: siteInfo
				});
			});
		});
	});
	return sitesPromise;
};
module.exports.getSiteInfo = function (currPath, site, registeredServerName) {
	var server = registeredServerName ? _getRegisteredServer(currPath, registeredServerName) : _getConfiguredServer(currPath);
	return _getSiteInfo(server, site);
};
module.exports.getSiteInfoWithToken = function (server, site) {
	return _getSiteInfo(server, site);
};
var _getSiteGUID = function (server, site) {
	var sitesPromise = new Promise(function (resolve, reject) {
		'use strict';

		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			return resolve({
				err: 'no server is configured'
			});
		}

		var request = _getRequest();

		var loginPromise = _loginToServer(server, request);
		loginPromise.then(function (result) {
			var auth = _getRequestAuth(server);

			var options = {
				url: server.url + '/documents/web?IdcService=SCS_BROWSE_SITES',
				auth: auth
			};
			request.get(options, function (err, response, body) {
				if (err) {
					console.log('ERROR: Failed to get site Id');
					console.log(err);
					return resolve({
						'err': err
					});
				}
				var data;
				try {
					data = JSON.parse(body);
				} catch (e) {}

				if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
					console.log('ERROR: Failed to get site Id ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
					return resolve({
						err: 'err'
					});
				}

				// JSONify the results
				var sites = {};
				var fields = data.ResultSets && data.ResultSets.SiteInfo && data.ResultSets.SiteInfo.fields || [];
				var rows = data.ResultSets && data.ResultSets.SiteInfo && data.ResultSets.SiteInfo.rows;
				rows.forEach(function (siteRows) {
					var nxtSite = {};
					siteRows.forEach(function (value, index) {
						nxtSite[fields[index].name] = value;
					});
					sites[nxtSite.fFolderName] = nxtSite;
				});

				// get the requested site
				var siteDetails = sites[site];
				return resolve({
					siteGUID: siteDetails && siteDetails.fFolderGUID,
					siteDetails: siteDetails
				});
			});
		});
	});
	return sitesPromise;
};
module.exports.getSiteFolder = function (currPath, site, registeredServerName) {
	var server = registeredServerName ? _getRegisteredServer(currPath, registeredServerName) : _getConfiguredServer(currPath);
	return _getSiteGUID(server, site);
};

module.exports.sleep = function (delay) {
	_sleep(delay);
};
var _sleep = function (delay) {
	var start = new Date().getTime();
	while (true) {
		if (new Date().getTime() >= start + delay) {
			break;
		}
	}
};
/**
 * 
 * @param {*} jobId 
 */
var _getTemplateImportStatus = function (request, host, jobId) {
	var importStatusPromise = new Promise(function (resolve, reject) {
		var gap = 5000;
		var limit = 50;
		var trials = [];
		for (var i = 0; i < limit; i++) {
			if (limit > 22) {
				gap = 7000;
			}
			trials.push({
				request: request,
				host: host,
				jobId: jobId,
				index: i + 1,
				delay: gap
			});
		}

		var initialTask = _getBackgroundServiceStatus(request, host, jobId);

		trials.reduce(function (jobStatusPromise, nextParam) {
			return jobStatusPromise.then(function (result) {
				// console.log(result);
				if (!result || result.err) {

				} else if (result.status === 'COMPLETE' || result.status === 'FAILED') {
					return resolve({
						status: result.status,
						LocalData: result.LocalData
					});
				} else {
					var trail = '';
					for (var i = 0; i < nextParam.index; i++) {
						trail += '.';
					}
					var msg = result.status === 'PROCESSING' ? (result.status + ' percentage: ' + result.percentage) : (result.status + ' ' + trail);
					console.log(' - importing: ' + msg);

					_sleep(nextParam.delay);
					return _getBackgroundServiceStatus(nextParam.request, nextParam.host, nextParam.jobId);
				}
			});
		}, initialTask);
	});
	return importStatusPromise;
};

var _getBackgroundServiceStatus = function (request, host, jobId) {
	var statusPromise = new Promise(function (resolve, reject) {
		var url = host + '/documents/web?IdcService=SCS_GET_BACKGROUND_SERVICE_JOB_STATUS&JobID=' + jobId;
		request.get(url, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get job status ');
				console.log(err);
				return resolve({
					err: 'err'
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to get job status ' + (data && data.LocalData ? '- ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var status;
			var percentage;
			var jobInfo = data.ResultSets && data.ResultSets.JobInfo;
			if (jobInfo) {
				var statusIdx, percentageIdx;
				for (var i = 0; i < jobInfo.fields.length; i++) {
					if (jobInfo.fields[i].name === 'JobStatus') {
						statusIdx = i;
					} else if (jobInfo.fields[i].name === 'JobPercentage') {
						percentageIdx = i;
					}
				}
				status = statusIdx ? jobInfo.rows[0][statusIdx] : '';
				percentage = percentageIdx ? jobInfo.rows[0][percentageIdx] : '';
			}
			return resolve({
				'status': status,
				'percentage': percentage,
				'LocalData': data.LocalData
			});
		});
	});
	return statusPromise;
};

/**
 * @param server the server object
 */
module.exports.getBackgroundServiceJobStatus = function (server, request, idcToken, jobId) {
	var statusPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/web?IdcService=SCS_GET_BACKGROUND_SERVICE_JOB_STATUS';
		url = url + '&JobID=' + jobId;
		url = url + '&idcToken=' + idcToken;

		var auth = _getRequestAuth(server);

		var params = {
			method: 'GET',
			url: url,
			auth: auth,
		};

		request(params, function (error, response, body) {
			if (error) {
				console.log('ERROR: Failed to get job status');
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to get job status' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : ''));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.JobInfo && data.ResultSets.JobInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.JobInfo && data.ResultSets.JobInfo.rows || [];

			var status = {};
			if (rows && rows.length > 0) {
				for (var i = 0; i < fields.length; i++) {
					var attr = fields[i].name;
					status[attr] = rows[0][i];
				}
			}
			return resolve(status);
		});
	});
	return statusPromise;
};

/**
 * @param server the server object
 */
module.exports.getBackgroundServiceJobData = function (server, request, idcToken, jobId) {
	var statusPromise = new Promise(function (resolve, reject) {
		var url = server.url + '/documents/web?IdcService=SCS_GET_BACKGROUND_SERVICE_JOB_RESPONSE_DATA';
		url = url + '&JobID=' + jobId;
		url = url + '&idcToken=' + idcToken;

		var auth = _getRequestAuth(server);

		var params = {
			method: 'GET',
			url: url,
			auth: auth,
		};

		request(params, function (error, response, body) {
			if (error) {
				console.log('ERROR: Failed to get job response data');
				console.log(error);
				resolve({
					err: 'err'
				});
			}

			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			var result = {};
			if (data && data.LocalData) {

				var fields = data.ResultSets && data.ResultSets.JobInfo && data.ResultSets.JobInfo.fields || [];
				var rows = data.ResultSets && data.ResultSets.JobInfo && data.ResultSets.JobInfo.rows || [];

				if (rows && rows.length > 0) {
					for (var i = 0; i < fields.length; i++) {
						var attr = fields[i].name;
						result[attr] = rows[0][i];
					}
				}
			}
			return resolve(result);
		});
	});
	return statusPromise;
};

/**
 * Get sites or templates from server using IdcService
 */
module.exports.browseSitesOnServer = function (request, server, fApplication) {
	var sitePromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);

		var url = server.url + '/documents/web?IdcService=SCS_BROWSE_SITES';
		if (fApplication) {
			url = url + '&fApplication=' + fApplication;
		}
		var options = {
			method: 'GET',
			url: url,
			auth: auth,
		};

		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get sites/templates');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to get sites/templates' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.SiteInfo && data.ResultSets.SiteInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.SiteInfo && data.ResultSets.SiteInfo.rows;
			var sites = []
			for (var j = 0; j < rows.length; j++) {
				sites.push({});
			}
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					sites[j][attr] = rows[j][i];
				}
			}
			// add metadata
			var mFields = data.ResultSets && data.ResultSets.dSiteMetaCollection && data.ResultSets.dSiteMetaCollection.fields || [];
			var mRows = data.ResultSets && data.ResultSets.dSiteMetaCollection && data.ResultSets.dSiteMetaCollection.rows || [];
			var siteMetadata = [];
			for (var j = 0; j < mRows.length; j++) {
				siteMetadata.push({});
			}
			for (var i = 0; i < mFields.length; i++) {
				var attr = mFields[i].name;
				for (var j = 0; j < mRows.length; j++) {
					siteMetadata[j][attr] = mRows[j][i];
				}
			}
			for (var i = 0; i < sites.length; i++) {
				for (var j = 0; j < siteMetadata.length; j++) {
					if (sites[i].fFolderGUID === siteMetadata[j].dIdentifier) {
						Object.assign(sites[i], siteMetadata[j]);
						break;
					}
				}
			}
			resolve({
				data: sites
			});
		});
	});
	return sitePromise;
};

/**
 * Get components from server using IdcService
 */
module.exports.browseComponentsOnServer = function (request, server) {
	var compPromise = new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);

		var url = server.url + '/documents/web?IdcService=SCS_BROWSE_APPS';

		var options = {
			method: 'GET',
			url: url,
			auth: auth,
		};

		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get components');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to get components ' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.AppInfo && data.ResultSets.AppInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.AppInfo && data.ResultSets.AppInfo.rows;
			var comps = []
			for (var j = 0; j < rows.length; j++) {
				comps.push({});
			}
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					comps[j][attr] = rows[j][i];
				}
			}

			// add metadata
			var mFields = data.ResultSets && data.ResultSets.dAppMetaCollection && data.ResultSets.dAppMetaCollection.fields || [];
			var mRows = data.ResultSets && data.ResultSets.dAppMetaCollection && data.ResultSets.dAppMetaCollection.rows || [];
			var appMetadata = [];
			for (var j = 0; j < mRows.length; j++) {
				appMetadata.push({});
			}
			for (var i = 0; i < mFields.length; i++) {
				var attr = mFields[i].name;
				for (var j = 0; j < mRows.length; j++) {
					appMetadata[j][attr] = mRows[j][i];
				}
			}
			for (var i = 0; i < comps.length; i++) {
				for (var j = 0; j < appMetadata.length; j++) {
					if (comps[i].fFolderGUID === appMetadata[j].dIdentifier) {
						Object.assign(comps[i], appMetadata[j]);
						break;
					}
				}
			}

			resolve({
				data: comps
			});
		});
	});
	return compPromise;
};

/**
 * Get themes from server using IdcService
 */
module.exports.browseThemesOnServer = function (request, server, params) {
	return new Promise(function (resolve, reject) {
		if (!server.url || !server.username || !server.password) {
			console.log('ERROR: no server is configured');
			resolve({
				err: 'no server'
			});
		}
		if (server.env !== 'dev_ec' && !server.oauthtoken) {
			console.log('ERROR: OAuth token');
			resolve({
				err: 'no OAuth token'
			});
		}

		var auth = _getRequestAuth(server);

		var url = server.url + '/documents/web?IdcService=SCS_BROWSE_THEMES';
		if (params) {
			url = url + '&' + params;
		}
		var options = {
			method: 'GET',
			url: url,
			auth: auth,
		};

		request(options, function (err, response, body) {
			if (err) {
				console.log('ERROR: Failed to get themes');
				console.log(err);
				return resolve({
					'err': err
				});
			}
			var data;
			try {
				data = JSON.parse(body);
			} catch (e) {}

			if (!data || !data.LocalData || data.LocalData.StatusCode !== '0') {
				console.log('ERROR: Failed to get themes' + (data && data.LocalData ? ' - ' + data.LocalData.StatusMessage : response.statusMessage));
				return resolve({
					err: 'err'
				});
			}

			var fields = data.ResultSets && data.ResultSets.ThemeInfo && data.ResultSets.ThemeInfo.fields || [];
			var rows = data.ResultSets && data.ResultSets.ThemeInfo && data.ResultSets.ThemeInfo.rows;
			var themes = []
			for (var j = 0; j < rows.length; j++) {
				themes.push({});
			}
			for (var i = 0; i < fields.length; i++) {
				var attr = fields[i].name;
				for (var j = 0; j < rows.length; j++) {
					themes[j][attr] = rows[j][i];
				}
			}

			resolve({
				data: themes
			});
		});
	});
};