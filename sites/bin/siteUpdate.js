/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

/**
 * Update site from template library
 */
var gulp = require('gulp'),
	serverUtils = require('../test/server/serverUtils.js'),
	serverRest = require('../test/server/serverRest.js'),
	contentLib = require('./content.js'),
	fs = require('fs'),
	readline = require('readline'),
	path = require('path');


var SITE_INFO_FILE = 'siteinfo.json',
	registeredServerName; // name of server passed through on the command line

var SiteUpdate = function () {};

var _logFiles = function (updateStep, folder, currentFileIndex, totalFiles) {
	var context = (folder || updateStep).padEnd(20);
	if (totalFiles === 0) {
		console.log(' - ' + context + ': no files in update, removing files on server');
	} else {
		if (currentFileIndex) {
			if (typeof process.stdout.clearLine === 'function') {
				process.stdout.clearLine();
			}
			process.stdout.write(' - ' + context + ': updating file# ' + currentFileIndex.toString().padEnd(4) + ' of ' + totalFiles.toString().padEnd(4) + ' files');
			readline.cursorTo(process.stdout, 0);

			if (currentFileIndex && currentFileIndex === totalFiles) {
				process.stdout.write('\n');
			}
		}
	}
};

var _getFilesFromTemplate = function (projectDir, templateName, folders) {
	// handle both ootb config & custom install

	var srcPath = serverUtils.getSourceFolder(projectDir);

	// get the template file
	var filesPath = path.join(srcPath, 'templates', templateName);
	if (folders) {
		folders.forEach(function (foldername) {
			filesPath = path.join(filesPath, foldername);
		});
	}

	var contents = [];
	if (fs.existsSync(filesPath)) {
		contents = fs.readdirSync(filesPath);
	}

	// return only files
	var files = [];
	contents.forEach(function (file) {
		var filePath = path.join(filesPath, file);
		if (!fs.lstatSync(filePath).isDirectory()) {
			files.push({
				fileName: file,
				filePath: filePath
			});
		}
	});
	return files;
};

var _getContentFromTemplate = function (projectDir, templateName) {
	// get all the content 
	return _getFilesFromTemplate(projectDir, templateName, ['content']);
};
var _getPagesFromTemplate = function (projectDir, templateName) {
	// get all the pages 
	return _getFilesFromTemplate(projectDir, templateName, ['pages']);
};
var _getSystemFromTemplate = function (projectDir, templateName) {
	// get all the system files 
	return _getFilesFromTemplate(projectDir, templateName);
};
var _getSettingsFolderFromTemplate = function (projectDir, templateName, folderPath) {
	// get all the system files 
	return _getFilesFromTemplate(projectDir, templateName, folderPath);
};

// get the GUID of the folder
// if no folder path is supplied, it simply returns the site GUID
// if a folder path is supplied, delete & re-create the folder
var _recreateFolder = function (siteGUID, folderPath) {
	return new Promise(function (resolve, reject) {
		if (folderPath.length > 0) {
			// we need to get all folders down to the leaf folder
			var folderPromises = [],
				parentGUID;
			folderPath.forEach(function (foldername) {
				folderPromises.push(function (parentID) {
					return serverRest.findOrCreateFolder({
						registeredServerName: registeredServerName,
						parentID: parentID,
						foldername: foldername
					});
				});
			});

			// get the folders in sequence
			var doFindFolder = folderPromises.reduce(function (previousPromise, nextPromise) {
					return previousPromise.then(function (folderDetails) {
						// store the parent
						parentGUID = folderDetails.id;

						// wait for the previous promise to complete and then return a new promise for the next 
						return nextPromise(parentGUID);
					});
				},
				// Start with a previousPromise value that is a resolved promise passing in the siteGUID as the parentID
				Promise.resolve({
					id: siteGUID
				}));

			// once we've found the folder (and parent folder)
			doFindFolder.then(function (folderDetails) {
				// delete the current folder
				serverRest.deleteFolder({
					registeredServerName: registeredServerName,
					fFolderGUID: folderDetails.id
				}).then(function (result) {
					// create a new folder and return it's GUID 
					serverRest.createFolder({
						registeredServerName: registeredServerName,
						parentID: parentGUID,
						foldername: folderPath[folderPath.length - 1]
					}).then(function (newFolder) {
						resolve(newFolder && newFolder.id);
					});
				});
			});
		} else {
			// no path supplied, return the site folder
			resolve(siteGUID);
		}
	});
};

/**
 * Refresh all the files in the folder in the site with those from the template. 
 * @param {object} argv command line arguments
 * @param {string} updateStep name of the step currently being executed
 * @param {Array.<string>} folderPath path to the folder to update
 * @param {Array.<string>} excludedFiles list of files to exclude from copy
 * @param {Array.<object>} files array of files from the template to use
 * @returns {Promise.<boolean>} true on successful upload of all pages
 */
SiteUpdate.prototype.updateSiteFolder = function (argv, siteEntry, updateStep, folderPath, excludedFiles, filesFunc) {
	var projectDir = argv.projectDir || path.join(__dirname, ".."),
		siteName = argv.site,
		templateName = argv.template,
		numErrors = 0,
		folderName = folderPath && folderPath[folderPath.length - 1] || '';

	return new Promise(function (resolve, reject) {
		// get the required folder GUID
		// this deletes & re-creates the leaf folder in the folderPath
		var folderPromise = _recreateFolder(siteEntry.siteGUID, folderPath);

		// once we have the folder...
		folderPromise.then(function (folderGUID) {
			// make sure we have a folder to update
			if (!folderGUID) {
				console.log('Error - failed to locate site folder');
				return resolve({
					errors: numErrors + 1,
					name: updateStep
				});
			}

			// get all the files from the template
			var allFiles = filesFunc(projectDir, templateName, folderPath),
				files = [];

			// remove excluded files
			allFiles.forEach(function (file) {
				if (excludedFiles.indexOf(file.fileName) === -1) {
					files.push(file);
				}
			});

			// note how may files to update
			var currentFileIndex = 0;
			_logFiles(updateStep, folderName, currentFileIndex, files.length);


			// upload all the template files
			var createFilePromises = [];
			files.forEach(function (file) {
				createFilePromises.push(function () {
					currentFileIndex++;
					_logFiles(updateStep, folderName, currentFileIndex, files.length);

					// get the content from the filesystem
					var contents = fs.readFileSync(file.filePath);

					// create the file
					return serverRest.createFile({
						registeredServerName: registeredServerName,
						parentID: folderGUID,
						filename: file.fileName,
						contents: contents
					}).then(function (newFile) {
						// check file creation
						if (!newFile) {
							numErrors++;
						}

						return Promise.resolve(newFile);
					});
				});
			});
			// run promises sequentially
			var doFileCreate = createFilePromises.reduce(function (previousPromise, nextPromise) {
					return previousPromise.then(function () {
						// wait for the previous promise to complete and then return a new promise for the next 
						return nextPromise();
					});
				},
				// Start with a previousPromise value that is a resolved promise 
				Promise.resolve());

			// once all files are downloaded, can continue
			doFileCreate.then(function (pages) {
				// resolve step listing the number of errors encountered
				return resolve({
					errors: numErrors,
					name: updateStep
				});
			}).catch(function (e) {
				console.log('Error: ' + updateStep + ' - failed');
				console.log(e);
				return resolve({
					errors: numErrors + 1,
					name: updateStep
				});
			});
		});
	});
};

// merge the site instance specific fields from the file on the server with that in the teplate
// This contains information such as "siteName" and "channelID" that is specific to the created site.  
// The value of this file in the template does not reflect the values created in the site.
SiteUpdate.prototype.updateSiteInfoFile = function (argv, siteEntry) {
	return new Promise(function (resolve, reject) {
		try {
			var projectDir = argv.projectDir || path.join(__dirname, ".."),
				templateName = argv.template,
				siteinfo;

			// get the path to the site info file
			var srcPath = serverUtils.getSourceFolder(projectDir);
			siteInfoPath = path.join(srcPath, 'templates', templateName, SITE_INFO_FILE);

			// read in and parse the siteinfo file
			siteinfo = JSON.parse(fs.readFileSync(siteInfoPath));

			// get the siteinfo file from the server
			// copy across the properties that are site specific
			var nonUpdatableProperties = [
					'themeName',
					'siteName',
					'isLive',
					'repositoryId',
					'channelId',
					'channelAccessTokens',
					'collectionId',
					'targetId',
					'targetAccessTokens',
					'arCollectionId',
					'conversationId',
					'isEnterprise',
					'defaultLanguage',
					'localizationPolicy',
					'siteRootPrefix',
					'siteURL',
					'siteConnections',
					'availableLanguages',
				],
				updatableProperties = [
					'description',
					'keywords',
					'header',
					'footer',
					'hideFromSearchEngines',
					'errorPage',
					'noIndex',
					'noFollow',
					'noArchive',
					'noSnippet',
					'isCobrowseEnabled',
					'cobrowseId',
					'mapProvider',
					'mapAPIKey',
					'isWebAnalyticsEnabled',
					'webAnalyticsScript'
				];

			// get the file from the server
			serverRest.findFile({
				registeredServerName: registeredServerName,
				parentID: siteEntry.siteGUID,
				filename: SITE_INFO_FILE
			}).then(function (fileDetails) {
				if (!fileDetails) {
					console.log('Error: failed to locate siteinfo file for site');
					return resolve(false);
				}

				serverRest.readFile({
					registeredServerName: registeredServerName,
					fFileGUID: fileDetails.id
				}).then(function (fileContent) {
					if (!fileContent) {
						console.log('Error: failed to get siteinfo file from server, changes to the file will not be propagated');
						return resolve(false);
					}

					// merge the properties
					var currSiteInfo = typeof fileContent === 'string' ? JSON.parse(fileContent) : fileContent;
					updatableProperties.forEach(function (property) {
						currSiteInfo.properties[property] = siteinfo.properties[property];
					});

					serverRest.createFile({
						registeredServerName: registeredServerName,
						parentID: siteEntry.siteGUID,
						filename: SITE_INFO_FILE,
						contents: JSON.stringify(currSiteInfo)
					}).then(function (result) {
						// note whether we successfully update the file
						return resolve(!!result);
					});
				});
			});
		} catch (e) {
			// failed to update the siteinfo file, make sure we don't include it
			console.log('Error: failed to update siteinfo file, changes to the file will not be propagated');
			return resolve(false);
		}
	});
};

/**
 * Refresh all the content in the site with those from the template. 
 * @param {object} argv command line arguments
 * @param {object} siteEntry object containing site GUID
 * @returns {Promise.<boolean>} true on successful upload of all files
 */
SiteUpdate.prototype.updateContent = function (argv, siteEntry) {
	var stepName = 'Embedded Content';
	return this.updateSiteFolder(argv, siteEntry, stepName, ['content'], [], _getContentFromTemplate);
};

/**
 * Refresh all the pages in the site with those from the template. 
 * @param {object} argv command line arguments
 * @returns {Promise.<boolean>} true on successful upload of all files
 */
SiteUpdate.prototype.updatePages = function (argv, siteEntry) {
	var stepName = 'Site Pages';
	return this.updateSiteFolder(argv, siteEntry, stepName, ['pages'], [], _getPagesFromTemplate);
};

/**
 * Refresh all the site system files in the site with those from the template. 
 * @param {object} argv command line arguments
 * @returns {Promise.<boolean>} true on successful upload of all files
 */
SiteUpdate.prototype.updateSystemFiles = function (argv, siteEntry) {
	var self = this,
		excludeFiles = [
			'_folder.json', // template only file
			SITE_INFO_FILE // handled separately
		],
		stepName = 'System Files';

	// Merge the siteinfo template file with that on the server
	return self.updateSiteInfoFile(argv, siteEntry).then(function (siteInfoUpdated) {
		// Now continue as before and update all the system files
		return self.updateSiteFolder(argv, siteEntry, stepName, [], excludeFiles, _getSystemFromTemplate).then(function (result) {
			// if siteinfo not included, increase the reported error count 
			if (!siteInfoUpdated) {
				result.errors = results.errors + 1;
			}
			return Promise.resolve(result);
		});
	});
};


/**
 * Refresh all the site settings files in the site with those from the template. 
 * @param {object} argv command line arguments
 * @returns {Promise.<boolean>} true on successful upload of all files
 */
SiteUpdate.prototype.updateSettingsFiles = function (argv, siteEntry) {
	var self = this,
		settingsFolders = ['controller', 'favicons', 'misc', 'seo', 'system'],
		settingsPromises = [],
		numErrors = 0,
		stepName = 'Settings Files';

	settingsFolders.forEach(function (folder) {
		settingsPromises.push(function () {
			return self.updateSiteFolder(argv, siteEntry, stepName, ['settings', folder], [], _getSettingsFolderFromTemplate);
		});
	});

	// run through each of the settings promises
	var doSettingsUpdates = settingsPromises.reduce(function (previousPromise, nextPromise) {
			return previousPromise.then(function (result) {
				// add in any errors from this step
				if (result) {
					numErrors += result.errors;
				}

				// wait for the previous promise to complete and then return a new promise for the next 
				return nextPromise();
			});
		},
		// Start with a previousPromise value that is a resolved promise 
		Promise.resolve());

	// collate and return the final number of errors
	return doSettingsUpdates.then(function (result) {
		numErrors += result.errors;

		return Promise.resolve({
			errors: numErrors,
			name: stepName
		});
	});
};

/**
 * Update the content in the site.
 * Unpublish and remove the items from the site's channel & collection
 * Re-import the items, adding uploaded items back into the site's channel & collection
 * @param {object} argv command line arguments
 * @returns {Promise.<boolean>} true on successful unpublish of all content from the site's channel
 */
SiteUpdate.prototype.updateSiteContent = function (argv, siteInfo) {
	var stepName = 'Content Update',
		numErrors = 0,
		projectDir = argv.projectDir || path.join(__dirname, "..");

	var channelToken;

	for (var i = 0; i < siteInfo.channelAccessTokens.length; i++) {
		if (siteInfo.channelAccessTokens[i].name === 'defaultToken') {
			channelToken = siteInfo.channelAccessTokens[i].value;
		}
	}

	//
	// Call the control-content API to remove all the existing content from the channel
	// 
	// set up the args to the control-content call
	var contentArgv = JSON.parse(JSON.stringify(argv));
	contentArgv.projectDir = projectDir;
	contentArgv.action = 'remove'; // remove items from the channel
	contentArgv.channel = argv.name || argv.site; // channel name is the same as the site name

	// ToDo:  At the moment you can't remove the content from the channel as it doesn't get added back in
	//        For now (for testing/demo) don't remove the content from the channel.
	var removeContentPromise = new Promise(function (resolve, reject) {
		var maxWait = 100,
			waitForCleanChannel = function () {
				try {
					// make sure there are no items in the channel
					serverRest.getChannelItems({
						registeredServerName: argv.server,
						currPath: projectDir,
						channelToken: channelToken,
						fields: 'isPublished,status'
					}).then(function (results) {
						var items = results || [];
						console.log(' - removing items in progress: channel has ' + items.length + ' items...');

						if (items.length === 0) {
							// if there are no items, we're done
							resolve({});
						} else {
							maxWait--;
							if (maxWait > 0) {
								// otherwise wait and try and again
								setTimeout(function () {
									waitForCleanChannel();
								}, 3000);
							} else {
								console.log(' - max wait for removal of content from channel exceeded, continuing');
								numErrors++;
								resolve({});
							}
						}

					});
				} catch (e) {
					console.log('Error: retreiving channel item count while waiting for deletion to complete');
					numErrors++;
					resolve({});
				}
			};

		contentLib.controlContent(contentArgv,
			function () {
				// done function - not used in this case
			},
			function () {
				// success callback - wait for clean channel
				console.log(' - removing items in progress: waiting for items to be removed');
				setTimeout(function () {
					waitForCleanChannel();
				});
			},
			function () {
				// error callback - update errors and resolve, will continue in any case
				numErrors++;
				resolve({});
			});
	});

	// wait for remove content to complete and then import the assets
	return removeContentPromise.then(function (removeResult) {
		// Re-import the items, adding uploaded items back into the site's channel & collection
		return contentLib.uploadContentFromTemplate({
			projectDir: projectDir,
			registeredServerName: argv.server,
			siteInfo: siteInfo,
			templateName: argv.template,
			updateContent: true
		}).then(function (result) {
			numErrors += (result.error ? 1 : 0);
			return Promise.resolve({
				errors: numErrors,
				name: stepName
			});
		});
	});
};


SiteUpdate.prototype.updateSite = function (argv, done) {
	try {
		var self = this,
			siteName = argv.name || argv.site,
			projectDir = argv.projectDir || path.join(__dirname, ".."),
			updateSitePromises = [],
			results = [];

		// store the registered server
		registeredServerName = argv.server;

		// logon and get the site folder GUID and Site info for the Channel/Repository/Collection details
		console.log('Updating site: ' + siteName);
		var serverDetailsPromise = serverUtils.getSiteFolder(projectDir, siteName, registeredServerName),
			serverInfoPromise = serverUtils.getSiteInfo(projectDir, siteName, registeredServerName);

		Promise.all([serverDetailsPromise, serverInfoPromise]).then(function (siteResults) {
			var siteEntry = siteResults[0],
				siteInfo = siteResults[1].siteInfo;

			// if can't locate the site, return
			if (!(siteEntry && siteEntry.siteGUID)) {
				console.log('Error: failed to locate site: ' + siteName);
				return;
			}

			//
			// Include all the steps to update the site
			// Note: Running steps serially to avoid overloading the server.  Could be run in parallel depending on performance/load impact.
			// 
			updateSitePromises.push(function () {
				return self.updatePages(argv, siteEntry);
			});
			updateSitePromises.push(function () {
				return self.updateContent(argv, siteEntry);
			});
			updateSitePromises.push(function () {
				return self.updateSystemFiles(argv, siteEntry);
			});
			updateSitePromises.push(function () {
				return self.updateSettingsFiles(argv, siteEntry);
			});
			updateSitePromises.push(function () {
				return self.updateSiteContent(argv, siteInfo);
			});

			// run through the update steps
			var doUpdateSteps = updateSitePromises.reduce(function (previousPromise, nextPromise) {
					return previousPromise.then(function (result) {
						// store the result of this step
						if (result) {
							results.push(result);
						}

						// wait for the previous promise to complete and then return a new promise for the next 
						return nextPromise();
					});
				},
				// Start with a previousPromise value that is a resolved promise 
				Promise.resolve());

			// once all files are downloaded, can continue
			doUpdateSteps.then(function (finalResult) {
				// add in the final result
				results.push(finalResult);

				// output the results
				console.log('Update Site Results:');
				results.forEach(function (result) {
					console.log(' - ' + result.name.padEnd(20) + ': completed with ' + result.errors + ' errors.');
				});
			}).catch(function (err) {
				console.log('Error: failed to update site: ');
				console.log(err);
			});
		});
	} catch (e) {
		console.log('ERROR: cec update-site failed');
		console.log(e);
		done();
	}
};



module.exports = new SiteUpdate();