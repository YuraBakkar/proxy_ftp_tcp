const { FtpSrv, FileSystem } = require('ftp-srv');
const fs = require('fs');
const net = require('net');
const tls = require('tls')

const ports = {
	ftp: 21,
	sftp: 990,
	app: 3000
}
const ftpCredentials = {
	username: '',
	password: ''
}
const tlsCertFiles = {
	key: "",
	cert: ""
}
const timerInterval = 10000
const hostname = '0.0.0.0';

var appConnectionCreated = false
var streamTcp
var ftpServer, sftpServer, ftpFolder;

class MyFileSystem extends FileSystem {
	constructor() {
		super(...arguments);
	}

	write(fileName, { append = false, start = undefined } = {}) {
		const localFile = ftpFolder + `${fileName}`;
		const stream = fs.createWriteStream(localFile);

		stream.once('finish', () => {
			fs.readFile(localFile, 'utf8', function (err, contents) {
				streamTcp.write(contents)
				fs.unlink(localFile, (err) => {
					if (err) {
						console.log('Error in delete file ', localFile)
					}
				})
			});
		});

		return stream;
	}
}

function createFTPServer() {
	ftpServer = new FtpSrv({ url: 'ftp://' + hostname + ':' + ports.ftp, pasv_url: 'ftp://' + hostname + ':' + ports.ftp, anonymous: false, greeting: ["Hello", "how are you"] })
	ftpServer.on('login', ({ connection, username, password }, resolve, reject) => {
		if (username === ftpCredentials.username && password === ftpCredentials.password) {
			var root = ftpFolder;
			var cwd = '/';
			return resolve({ root: root, cwd: cwd, fs: new MyFileSystem(connection, { root: root, cwd: cwd }) });
		} else reject('Bad username or password');
	});

	ftpServer.listen()
		.then(() => {
			console.log(`FTP Server running at ${ports.ftp}`);
		});
}

function createSFTPServer() {
	let tlsOptions
	try {
		tlsOptions = {
			key: fs.readFileSync(tlsCertFiles.key),
			cert: fs.readFileSync(tlsCertFiles.cert),
			secureProtocol: 'TLSv1_2_client_method'
		}
	} catch (err) {
		console.log("Error reading cert files. SFTP server won't start...")
		return
	}

	sftpServer = new FtpSrv({ url: 'ftps://' + hostname + ':' + ports.sftp, pasv_url: 'ftps://' + hostname + ':' + ports.sftp, anonymous: false, greeting: ["Hello", "how are you"], tls: tls.createSecureContext(tlsOptions) })
	sftpServer.on('login', ({ connection, username, password }, resolve, reject) => {
		if (username === ftpCredentials.username && password === ftpCredentials.password) {
			var root = ftpFolder;
			var cwd = '/';
			return resolve({ root: root, cwd: cwd, fs: new MyFileSystem(connection, { root: root, cwd: cwd }) });
		} else reject('Bad username or password');
	});

	sftpServer.listen()
		.then(() => {
			console.log(`SFTP Server running at ${ports.sftp}`);
		});
}

function checkAndCreateAppConnection() {
	if (!appConnectionCreated) {
		streamTcp = net.createConnection(ports.app);
		streamTcp.on('error', function (error) {
			appConnectionCreated = false
			console.log('Error connection with APP, try to connect from ', timerInterval / 1000, ' seconds...')
		});
		streamTcp.on('connect', function (error) {
			appConnectionCreated = true
			console.log('Connection with APP was established.')
		});
	}
	setTimeout(checkAndCreateAppConnection, timerInterval)
}

function readFromDataJSON(filename) {
	return new Promise((resolve, reject) => {
		fs.readFile(filename, 'utf8', function (err, contents) {
			if (!err) {
				try {
					let json = JSON.parse(contents)
					ports.ftp = json.ftp
					ports.sftp = json.sftp
					ports.app = json.app
					tlsCertFiles.key = json.ftpskey
					tlsCertFiles.cert = json.ftpscert
					ftpFolder = json.ftpfolder
					ftpCredentials.username = json.ftpusername
					ftpCredentials.password = json.ftppassword
				} catch (err) {
					console.log(err)
				}
			}
			resolve()
		});
	})
}

//console.log(tls.getCiphers())
readFromDataJSON('data.json').then(() => {
	checkAndCreateAppConnection()
	createFTPServer()
	createSFTPServer()
})