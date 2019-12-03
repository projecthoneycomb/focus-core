const fs = require('fs-extra');
const path = require('path');
const process = require('process');
const ffmpeg = require('fluent-ffmpeg');

class PlaylistStream {

  constructor(name, host, port) {
    if(!host || !port) {
      host = process.env['RTMP_INGEST_HOST']
      port = process.env['RTMP_INGEST_PORT']
    }

    if(!host || !port) {
      throw new Error('No host or port supplied for RTMP streaming.')
    }

    if(!name) {
      throw new Error('You must provide a stream name.')
    }

    this.name = name;
    this.host = host;
    this.port = port;
  }

  async initialise() {
    // Confirm the 'tracks' directory exists
    let tracksDirectory = await this.getTrackDirectory()   // Throws if doesn't exist
    
    // Ensure that 'tracks' directory is in a valid state (no playlist files)
    await this.cleanTrackFolder(tracksDirectory)

    // Using the 'tracks' directory, create and shuffle a playlist to stream
    let playlistPath = await this.createPlaylist(tracksDirectory)
    console.log(playlistPath);
    this.playlist = playlistPath;
  }

  async getTrackDirectory() {
    let expectedDirectory = path.resolve(process.cwd(), './tracks');
    let playlistExists = await fs.exists(expectedDirectory);

    if(!playlistExists) {
      throw new Error(`There is no 'tracks' directory.`);
    }

    return expectedDirectory;
  }

  async cleanTrackFolder(tracksDirectory) {
    await fs.remove(`${tracksDirectory}/playlist-alpha.txt`);
    await fs.remove(`${tracksDirectory}/playlist-beta.txt`);
  }

  async createPlaylist(tracksDirectory) {
    let files = await fs.readdir(tracksDirectory);
    files = shuffle(files);
    let playlistMeta = `ffconcat version 1.0`
    let playlist = files.reduce((playlist, track) => {
      if(track === '.DS_Store') return;
      return `${playlist}
    file '${track}'`
    }, playlistMeta)

    await fs.writeFile(`${tracksDirectory}/playlist-alpha.txt`, `${playlist}
    file 'playlist-beta.txt'`);

    await fs.writeFile(`${tracksDirectory}/playlist-beta.txt`, `${playlist}
    file 'playlist-alpha.txt'`);

    return `${tracksDirectory}/playlist-alpha.txt`;
  }

  start() {
    const command = ffmpeg();

    // Point the input to a text file that contains all of the mp3s to stream + a self referential 
    command.input(this.playlist)

    command.withNativeFramerate()
    command.inputOptions('-f concat')
    command.withOptions(
      '-max_muxing_queue_size', '9999',
      '-c:a',
      'aac'
    )
    
    command.output(`rtmp://${this.host}:${this.port}/live/${this.name}`)
    command.format('flv');
    
    command.on('start', function(commandLine) {
      console.log('Spawned Ffmpeg with command: ' + commandLine);
    })
    .on('stderr', (message) => console.log('stderr', message))
    .on('progress', function (progress) {
      console.log(`Heartbeat... ${progress.timemark} - ${progress.targetSize}`);
    })
    
    command.run()
  }

  
}

function shuffle(a) {
  var j, x, i;
  for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      x = a[i];
      a[i] = a[j];
      a[j] = x;
  }
  return a;
}

module.exports = PlaylistStream;


/*
INIT:
  *

 - Read expected directory
 - Generate concat playlists
 - Start streaming to RTMP (url & id)
 - Log startup and connection
*/