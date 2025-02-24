/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname, process, console */
/* jshint esversion: 6 */

var gulp = require('gulp'),
	os = require('os'),
	assetlib = require('./asset.js'),
	componentlib = require('./component.js'),
	contentlayoutlib = require('./contentlayout.js'),
	contentlib = require('./content.js'),
	doclib = require('./document.js'),
	reportlib = require('./report.js'),
	readline = require('readline'),
	resourcelib = require('./resource.js'),
	rsslib = require('./rss.js'),
	templatelib = require('./template.js'),
	sitelib = require('./site.js'),
	siteUpdateLib = require('./siteUpdate.js'),
	siteIndexlib = require('./siteIndex.js'),
	siteMaplib = require('./siteMap.js'),
	themelib = require('./theme.js'),
	translationlib = require('./translation.js'),
	fs = require('fs'),
	fse = require('fs-extra'),
	path = require('path'),
	childProcess = require('child_process'),
	argv = require('yargs').argv,
	config = require('../config/config.json'),
	semver = require('semver'),
	sprintf = require('sprintf-js').sprintf;

var serverUtils = require('../test/server/serverUtils.js');

var cecDir = path.join(__dirname, ".."),
	configDataDir = path.join(cecDir, 'data', 'config');

var projectDir,
	serversSrcDir;

// console.log('cecDir: ' + cecDir);

const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';


/**
 * Verify the source structure before proceed the command
 * @param {*} done 
 */
var verifyRun = function () {
	projectDir = argv.projectDir;

	var srcfolder = serverUtils.getSourceFolder(projectDir);

	// set source folders
	serversSrcDir = path.join(srcfolder, 'servers');

	return true;
};

/******************************* gulp tasks *******************************/

/**
 * 
 */
gulp.task('install-src', function (done) {
	'use strict';

	projectDir = argv.projectDir || projectDir;

	// existing setup
	var currserver = serverUtils.getConfiguredServer();

	// create the config file
	var configPath = path.join(projectDir, 'cec.properties');
	var newConfig = false;
	if (!fs.existsSync(configPath)) {
		fse.copySync(path.join(configDataDir, 'cec.properties'), configPath);
		newConfig = true;
	}

	// create the default package.json
	if (!fs.existsSync(path.join(projectDir, 'package.json'))) {
		fse.copySync(path.join(configDataDir, 'src-package.json'), path.join(projectDir, 'package.json'));
	}

	// create symlink to libs
	try {
		fse.ensureSymlinkSync(path.join(cecDir, 'src', 'libs'), path.join(projectDir, 'libs'));
	} catch (err) {
		console.error('ERROR: ' + err);
	}

	// read the config file 
	var srcFolder = path.join(projectDir, 'src');

	// set up src folders
	if (!fs.existsSync(srcFolder)) {
		fs.mkdirSync(srcFolder);
	}

	if (!fs.existsSync(path.join(srcFolder, 'components'))) {
		fs.mkdirSync(path.join(srcFolder, 'components'));
	}
	if (!fs.existsSync(path.join(srcFolder, 'templates'))) {
		fs.mkdirSync(path.join(srcFolder, 'templates'));
	}
	if (!fs.existsSync(path.join(srcFolder, 'themes'))) {
		fs.mkdirSync(path.join(srcFolder, 'themes'));
	}

	// ./dist/
	if (!fs.existsSync(path.join(projectDir, 'dist'))) {
		fs.mkdirSync(path.join(projectDir, 'dist'));
	}

	// set the server in config with existing settings
	if (newConfig && currserver.url) {
		// console.log(' - set CEC server with ' + currserver.fileloc);
		var configstr = fs.readFileSync(configPath).toString();
		configstr = configstr.replace('cec_url=', 'cec_url=' + currserver.url);
		configstr = configstr.replace('cec_username=', 'cec_username=' + currserver.username);
		configstr = configstr.replace('cec_password=', 'cec_password=' + currserver.password);
		configstr = configstr.replace('cec_env=', 'cec_env=' + currserver.env);
		fs.writeFileSync(configPath, configstr);
	}

	console.log('Project set up, config CEC server in ' + configPath);

	// install dependencies
	console.log('Install dependencies from package.json:');
	var installCmd = childProcess.spawnSync(npmCmd, ['install', '--prefix', projectDir], {
		projectDir,
		stdio: 'inherit'
	});

	var seedArgs = ['run', 'create-component', '--prefix', cecDir,
		'--',
		'--projectDir', projectDir,
		'--name', 'Sample-To-Do',
		'--source', 'Sample-To-Do'
	];
	var seedCmd = childProcess.spawnSync(npmCmd, seedArgs, {
		projectDir,
		stdio: 'inherit'
	});

	done();
});


gulp.task('develop', function (done) {
	'use strict';

	if (!verifyRun()) {
		done();
		return;
	}

	var port = argv.port || '8085';
	process.env['CEC_TOOLKIT_PORT'] = port;
	process.env['CEC_TOOLKIT_SERVER'] = argv.server || '';
	process.env['CEC_TOOLKIT_PROJECTDIR'] = projectDir;

	var args = ['run', 'start', '--prefix', cecDir];
	var spawnCmd = childProcess.spawnSync(npmCmd, args, {
		projectDir,
		stdio: 'inherit'
	});
	done();
});

gulp.task('sync-server', function (done) {
	'use strict';

	if (!verifyRun()) {
		done();
		return;
	}

	var srcServerName = argv.server;
	if (!fs.existsSync(path.join(serversSrcDir, srcServerName, 'server.json'))) {
		console.log('ERROR: source server ' + srcServerName + ' does not exist');
		done();
		return;
	};

	var destServerName = argv.destination;
	if (!fs.existsSync(path.join(serversSrcDir, destServerName, 'server.json'))) {
		console.log('ERROR: destination server ' + destServerName + ' does not exist');
		done();
		return;
	};

	var port = argv.port || '8086';
	process.env['CEC_TOOLKIT_SYNC_PORT'] = port;
	process.env['CEC_TOOLKIT_SYNC_SRC'] = srcServerName;
	process.env['CEC_TOOLKIT_SYNC_DEST'] = destServerName;
	process.env['CEC_TOOLKIT_PROJECTDIR'] = projectDir;
	process.env['CEC_TOOLKIT_SYNC_HTTPS_KEY'] = '';
	process.env['CEC_TOOLKIT_SYNC_HTTPS_CERTIFICATE'] = '';
	
	var keyPath = argv.key;
	if (keyPath) {
		if (!path.isAbsolute(keyPath)) {
			keyPath = path.join(projectDir, keyPath);
		}
		keyPath = path.resolve(keyPath);
		if (!fs.existsSync(keyPath)) {
			console.log('ERROR: file ' + keyPath + ' does not exist');
			done();
			return;
		}
		process.env['CEC_TOOLKIT_SYNC_HTTPS_KEY'] = keyPath;
	}

	var certPath = argv.certificate;
	if (certPath) {
		if (!path.isAbsolute(certPath)) {
			certPath = path.join(projectDir, certPath);
		}
		certPath = path.resolve(certPath);
		if (!fs.existsSync(certPath)) {
			console.log('ERROR: file ' + certPath + ' does not exist');
			done();
			return;
		}
		process.env['CEC_TOOLKIT_SYNC_HTTPS_CERTIFICATE'] = certPath;
	}


	var rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	rl._writeToOutput = function _writeToOutput(stringToWrite) {
		if (rl.stdoutMuted) {
			var str = stringToWrite.replace(/(\r\n|\n|\r)/gm, '').trim();
			if (str) {
				rl.output.write("*");
			}
		} else {
			rl.output.write(stringToWrite);
		}
	};

	var username = argv.username || '';
	var password = argv.password || '';

	var usernamePromises = [];
	if (!username) {
		usernamePromises.push(_promptInput(rl, 'Please enter username: '));
	}
	Promise.all(usernamePromises)
		.then(function (results) {
			if (!username) {
				username = results[0].value;
				if (!username) {
					console.log('ERROR: username is empty');
					return Promise.reject();
				}
			}

			var passwordPromises = [];
			if (!password) {
				rl.stdoutMuted = true;
				passwordPromises.push(_promptInput(rl, 'Please enter password: '));
			}

			return Promise.all(passwordPromises);
		})
		.then(function (results) {
			if (!password) {
				password = results[0].value;
				if (!password) {
					console.log('ERROR: password is empty');
					return Promise.reject();
				}
				console.log('');
			}

			rl.stdoutMuted = false;
			rl.close();

			process.env['CEC_TOOLKIT_SYNC_USERNAME'] = username;
			process.env['CEC_TOOLKIT_SYNC_PASSWORD'] = password;

			var args = ['run', 'start-sync', '--prefix', cecDir];
			var spawnCmd = childProcess.spawnSync(npmCmd, args, {
				projectDir,
				stdio: 'inherit'
			});

			done();
		})
		.catch((error) => {
			rl.stdoutMuted = false;
			rl.close();
			done();
		});

});

var _promptInput = function (rl, question) {
	return new Promise((resolve, reject) => {
		console.log(question);
		rl.question('', (answer) => {
			resolve({
				value: answer
			});
		});
	});
};

/**
 * Create folder
 */
gulp.task('create-folder', function (done) {
	'use strict';

	doclib.createFolder(argv, done);
});

/**
 * Share folder
 */
gulp.task('share-folder', function (done) {
	'use strict';

	doclib.shareFolder(argv, done);
});

/**
 * Unshare folder
 */
gulp.task('unshare-folder', function (done) {
	'use strict';

	doclib.unshareFolder(argv, done);
});

/**
 * Download folder
 */
gulp.task('download-folder', function (done) {
	'use strict';

	doclib.downloadFolder(argv, done);
});

/**
 * Upload folder
 */
gulp.task('upload-folder', function (done) {
	'use strict';

	doclib.uploadFolder(argv, done);
});

/**
 * Upload file
 */
gulp.task('upload-file', function (done) {
	'use strict';

	doclib.uploadFile(argv, done);
});

/**
 * Download file
 */
gulp.task('download-file', function (done) {
	'use strict';

	doclib.downloadFile(argv, done);
});

/**
 * Create component
 * Unzip the zip file of the seeded component and place into the /src
 */
gulp.task('create-component', function (done) {
	'use strict';

	componentlib.createComponent(argv, done);
});

/**
 * Copy component
 * Copy a component in /src
 */
gulp.task('copy-component', function (done) {
	'use strict';

	componentlib.copyComponent(argv, done);
});

/**
 * Import component
 * Unzip the component zip file and place into the /src
 */
gulp.task('import-component', function (done) {
	'use strict';

	componentlib.importComponent(argv, done);
});


/**
 * Create all content types on the server
 */
gulp.task('list-server-content-types', function (done) {
	'use strict';

	contentlayoutlib.listServerContentTypes(argv, done);
});

/**
 * Create content layout
 * Unzip the zip file of the seeded content layout and place into the /src
 */
gulp.task('create-contentlayout', function (done) {
	'use strict';

	contentlayoutlib.createContentLayout(argv, done);
});

/**
 * Add content layout mapping to a template
 */
gulp.task('add-contentlayout-mapping', function (done) {
	'use strict';

	contentlayoutlib.addContentLayoutMapping(argv, done);
});

/**
 * remove content layout mapping from a template
 */
gulp.task('remove-contentlayout-mapping', function (done) {
	'use strict';

	contentlayoutlib.removeContentLayoutMapping(argv, done);
});

/**
 * Create template
 * Unzip the zip file of the seeded template and place into the /src
 */
gulp.task('create-template', function (done) {
	'use strict';

	templatelib.createTemplate(argv, done);
});

/**
 * Create template from a site
 */
gulp.task('create-template-from-site', function (done) {
	'use strict';

	templatelib.createTemplateFromSite(argv, done);
});

/**
 * Copy template
 * copy a template and its scheme and place into the /src
 */
gulp.task('copy-template', function (done) {
	'use strict';

	templatelib.copyTemplate(argv, done);
});

/**
 * Import template
 * Unzip the template zip file and place into the /src
 */
gulp.task('import-template', function (done) {
	'use strict';

	templatelib.importTemplate(argv, done);
});

/**
 * Export template
 * Create the template zip with its theme and components
 */
gulp.task('export-template', function (done) {
	'use strict';

	templatelib.exportTemplate(argv, done);
});

/**
 * deploy template
 */
gulp.task('deploy-template', function (done) {
	'use strict';

	templatelib.deployTemplate(argv, done);
});

/**
 * upload template
 */
gulp.task('upload-template', function (done) {
	'use strict';

	templatelib.deployTemplate(argv, done);
});

/**
 * describe template
 */
gulp.task('describe-template', function (done) {
	'use strict';

	templatelib.describeTemplate(argv, done);
});

/**
 * download template from server
 */
gulp.task('download-template', function (done) {
	'use strict';

	templatelib.downloadTemplate(argv, done);
});

/**
 * Compile template
 * compile a template and place compiles pages under the sites assets
 */
gulp.task('compile-template', function (done) {
	'use strict';

	templatelib.compileTemplate(argv, done);
});


/**
 * delete template on server
 */
gulp.task('delete-template', function (done) {
	'use strict';

	templatelib.deleteTemplate(argv, done);
});

/**
 * download content from server
 */
gulp.task('download-content', function (done) {
	'use strict';

	contentlib.downloadContent(argv, done);
});

/**
 * upload content to server
 */
gulp.task('upload-content', function (done) {
	'use strict';

	contentlib.uploadContent(argv, done);
});


/**
 * sync channel content on destination server from source server
 */
gulp.task('sync-content', function (done) {
	'use strict';

	contentlib.syncContent(argv, done);
});

/**
 * Add component to a theme
 */
gulp.task('add-theme-component', function (done) {
	'use strict';

	templatelib.addThemeComponent(argv, done);
});

/**
 * Remove component from a theme
 */
gulp.task('remove-theme-component', function (done) {
	'use strict';

	templatelib.removeThemeComponent(argv, done);
});

/**
 * Control theme
 */
gulp.task('control-theme', function (done) {
	'use strict';

	themelib.controlTheme(argv, done);
});


/**
 * Export a component zip
 */
gulp.task('export-component', function (done) {
	'use strict';

	componentlib.exportComponent(argv, done);
});

/**
 * Download components
 */
gulp.task('download-component', function (done) {
	componentlib.downloadComponent(argv, done);
});


/**
 * Deploy components
 */
gulp.task('deploy-component', function (done) {
	componentlib.deployComponent(argv, done);
});

/**
 * Upload components
 */
gulp.task('upload-component', function (done) {
	componentlib.deployComponent(argv, done);
});

/**
 * Control components
 */
gulp.task('control-component', function (done) {
	componentlib.controlComponent(argv, done);
});


/**
 * Copy the configured libraries from node_modules into library folder
 */
gulp.task('copy-libs', function (done) {
	'use strict';
	if (config && config.build && config.build.libs && config.build.libs.length > 0) {
		const libs = config.build.libs;
		const paths = libs.map((lib) => '../node_modules/' + lib + '/**/*');

		// Rename @oracle/oraclejet to oraclejet
		libs[libs.findIndex(element => element === '@oracle/oraclejet')] = 'oraclejet';

		// Rename @oracle/oraclejet/node_modules/jquery-ui to jquery-ui
		libs[libs.findIndex(element => element === '@oracle/oraclejet/node_modules/jquery-ui')] = 'jquery-ui';

		// Rename @webcomponents/custom-elements to custom-elements
		libs[libs.findIndex(element => element === '@webcomponents/custom-elements')] = 'custom-elements';

		// Rename @fortawesome/fontawesome-free to font-awesome
		libs[libs.findIndex(element => element === '@fortawesome/fontawesome-free')] = 'font-awesome';

		paths.forEach((path, index) => {
			console.log("Copying... " + path);
			gulp.src(path).pipe(gulp.dest('../src/libs/' + libs[index] + '/'));
		});
	}
	console.log("\nTo use the CEC command line util, run the following command:");
	if (/^darwin/.test(process.platform)) {
		console.log("\t sudo npm run install-cec \n");
	} else {
		console.log("\t npm run install-cec \n");
	}
	done();
});


/**
 * List resources such as templates and components
 */
gulp.task('list', function (done) {
	'use strict';

	if (!verifyRun()) {
		done();
		return;
	}

	if (argv.server) {
		resourcelib.listServerResources(argv, done);
	} else {
		resourcelib.listLocalResources(argv, done);
	}
});

/**
 * Create enterprise site
 */
gulp.task('create-site', function (done) {
	'use strict';

	sitelib.createSite(argv, done);
});

/**
 * Control site
 */
gulp.task('control-site', function (done) {
	'use strict';

	sitelib.controlSite(argv, done);
});


/**
 * update site
 */
gulp.task('update-site', function (done) {
	'use strict';

	siteUpdateLib.updateSite(argv, done);
});

/**
 * Validate site
 */
gulp.task('validate-site', function (done) {
	'use strict';

	sitelib.validateSite(argv, done);
});

/**
 * Index site
 * Create content items with the keywords on site page and import the items to the server
 */
gulp.task('index-site', function (done) {
	'use strict';

	siteIndexlib.indexSite(argv, done);
});

/**
 * Create site map
 * Create XML site map for a site and upload it to the server
 */
gulp.task('create-site-map', function (done) {
	'use strict';

	siteMaplib.createSiteMap(argv, done);
});

/**
 * Create RSS feed
 * Create RSS feed for a site and upload it to the server
 */
gulp.task('create-rss-feed', function (done) {
	'use strict';

	rsslib.createRSSFeed(argv, done);
});

/**
 * Generate asset usage report for a site 
 */
gulp.task('create-asset-report', function (done) {
	'use strict';

	reportlib.createAssetReport(argv, done);
});


/**
 * Create a repository
 */
gulp.task('create-repository', function (done) {
	'use strict';

	assetlib.createRepository(argv, done);
});

/**
 * Control a repository (add/remove types/channels)
 */
gulp.task('control-repository', function (done) {
	'use strict';

	assetlib.controlRepository(argv, done);
});

/**
 * Share a repository
 */
gulp.task('share-repository', function (done) {
	'use strict';

	assetlib.shareRepository(argv, done);
});

/**
 * Unshare a repository
 */
gulp.task('unshare-repository', function (done) {
	'use strict';

	assetlib.unShareRepository(argv, done);
});

/**
 * Share a type
 */
gulp.task('share-type', function (done) {
	'use strict';

	assetlib.shareType(argv, done);
});

/**
 * Unshare a type
 */
gulp.task('unshare-type', function (done) {
	'use strict';

	assetlib.unshareType(argv, done);
});

/**
 * Create a channel
 */
gulp.task('create-channel', function (done) {
	'use strict';

	assetlib.createChannel(argv, done);
});

/**
 * Create a localization policy
 */
gulp.task('create-localization-policy', function (done) {
	'use strict';

	assetlib.createLocalizationPolicy(argv, done);
});

/**
 * Download a translation job from the server
 */
gulp.task('download-translation-job', function (done) {
	'use strict';

	translationlib.downloadTranslationJob(argv, done);
});

/**
 * Import a translation job to the server
 */
gulp.task('upload-translation-job', function (done) {
	'use strict';

	translationlib.uploadTranslationJob(argv, done);
});

/**
 * List local or server translation jobs
 */
gulp.task('list-translation-jobs', function (done) {
	'use strict';

	translationlib.listTranslationJobs(argv, done);
});

/**
 * Create a translation job on the server
 */
gulp.task('create-translation-job', function (done) {
	'use strict';

	translationlib.createTranslationJob(argv, done);
});

/**
 * Submit translation job to LSP server
 */
gulp.task('submit-translation-job', function (done) {
	'use strict';

	translationlib.submitTranslationJob(argv, done);
});

/**
 * Ingest translatedjob 
 */
gulp.task('ingest-translation-job', function (done) {
	'use strict';

	translationlib.ingestTranslationJob(argv, done);
});


/**
 * Register translation connector
 */
gulp.task('register-translation-connector', function (done) {
	'use strict';

	translationlib.registerTranslationConnector(argv, done);
});

/**
 * Create translation connector
 */
gulp.task('create-translation-connector', function (done) {
	'use strict';

	translationlib.createTranslationConnector(argv, done);
});

/**
 * Start translation connector
 */
gulp.task('start-translation-connector', function (done) {
	'use strict';

	translationlib.startTranslationConnector(argv, done);
});

gulp.task('check-version', function (done) {
	'use strict';

	// check if the message already shown 
	var msgFile = path.join(os.tmpdir(), 'cec_sitestoolkit_message');
	if (fs.existsSync(msgFile)) {
		var statInfo = fs.statSync(msgFile);
		var lastModifiedTime = statInfo.mtimeMs;
		var currTime = (new Date()).getTime();
		var oneDay = 1000 * 60 * 60 * 24;
		var diffDays = Math.round((currTime - lastModifiedTime) / oneDay);
		// console.log(' - file ' + msgFile + ' last updated on ' + statInfo.mtime + ' days passed: ' + diffDays);
		// warn every 30 days :-)
		if (diffDays < 30) {
			return;
		}
	}

	projectDir = argv.projectDir || projectDir;

	var server = serverUtils.getConfiguredServer(projectDir);
	if (!server.url || !server.username || !server.password) {
		// console.log(' - no server is configured in ' + server.fileloc);
		return;
	}

	var Client = require('node-rest-client').Client;
	var client = new Client({
		user: server.username,
		password: server.password
	});

	var isPod = server.env !== 'dev_ec';
	var url = server.url + (isPod ? '/content' : '/osn/social/api/v1/connections');
	client.get(url, function (data, response) {
		if (!response || response.statusCode !== 200) {
			// console.log('ERROR: failed to query CEC version: ' + (response && response.statusMessage));
			return;
		}
		var cecVersion, cecVersion2;
		if (isPod) {
			cecVersion = data ? data.toString() : '';
			if (!cecVersion) {
				// console.log('ERROR: no value returned for CEC version');
				return;
			}

			if (cecVersion.indexOf('Revision:') >= 0) {
				cecVersion = cecVersion.substring(cecVersion.indexOf('Revision:') + 'Revision:'.length);
			}
			cecVersion = cecVersion.trim();

			if (cecVersion.indexOf('/') > 0) {
				cecVersion = cecVersion.substring(0, cecVersion.indexOf('/'));
			}

			var arr = cecVersion.split('.');
			var versionstr = arr.length >= 2 ? arr[1] : '';

			// the version is a string such as 1922ec
			if (versionstr && versionstr.length >= 3) {
				cecVersion2 = versionstr.charAt(0) + versionstr.charAt(1) + '.' + versionstr.charAt(2);
				cecVersion = cecVersion2;
				if (versionstr.length > 3) {
					cecVersion = cecVersion + '.' + versionstr.charAt(3);
				}
			}
		} else {
			cecVersion = data && data.version;
			if (!cecVersion) {
				// console.log('ERROR: no value returned for CEC version');
				return;
			}
			var arr = cecVersion.split('.');
			cecVersion2 = arr.length >= 2 ? arr[0] + '.' + arr[1] : (arr.length > 0 ? arr[0] : '');
		}
		// console.log(' CEC server: ' + server.url + '  version: ' + cecVersion + ' version2: ' + cecVersion2);

		// get the toolkit version
		var packagejsonpath = path.join(cecDir, 'package.json');
		var toolkitVersion;
		if (fs.existsSync(packagejsonpath)) {
			var str = fs.readFileSync(packagejsonpath);
			var packagejson = JSON.parse(str);
			toolkitVersion = packagejson && packagejson.version;
		}

		if (!toolkitVersion) {
			//console.log('ERROR: version found in ' + packagejsonpath);
			return;
		}
		arr = toolkitVersion.split('.');
		var toolkitVersion2 = arr.length >= 2 ? arr[0] + '.' + arr[1] : (arr.length > 0 ? arr[0] : '');
		// console.log('toolkit version ' + packagejsonpath + ' version: ' + toolkitVersion + ' version2: ' + toolkitVersion2);

		if (cecVersion2 && toolkitVersion2 && semver.gt(semver.coerce(cecVersion2), semver.coerce(toolkitVersion2))) {
			var format = '%-1s %-50s  %-s';
			var sep = '*';
			console.log('');
			console.log('*******************************************************');
			console.log(sprintf(format, sep, 'A newer version of Sites Toolkit CLI is available.', sep));
			console.log(sprintf(format, sep, 'You are using ' + toolkitVersion + '. The latest is ' + cecVersion + '.', sep));
			console.log(sprintf(format, sep, 'Your current version will be deprecated soon.', sep));
			console.log('*******************************************************');

			// create the message file
			fs.writeFileSync(msgFile, 'CEC version: ' + cecVersion + ', toolkit version: ' + toolkitVersion + ', need upgrade.');
		}

		done();
	});
});

/**
 * Register server
 */
gulp.task('register-server', function (done) {
	'use strict';

	resourcelib.registerServer(argv, done);
});

/**
 * Default task
 */
gulp.task('default', function () {
	'use strict';
	console.log("No default task!");
});