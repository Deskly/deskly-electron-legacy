const {
  app,
  Tray,
  Menu,
  ipcRenderer,
  BrowserWindow
} = require('electron');
const path = require('path');
const pug = require('electron-pug')({
  pretty: true
}, {});
const needle = require('needle');
const fs = require('fs');
const wallpaper = require('wallpaper');
const ncp = require("copy-paste");
const notifier = require('node-notifier');
const Config = require('electron-config');
const Debug = require('electron-debug');

const iconPath = path.join(__dirname, 'assets/images/iconTemplate.png');
const config = new Config({
  defaults: {
    subreddits: [
      'wallpaper',
      'wallpapers',
      'minimalwallpaper',
      'earthporn'
    ],
    sorttype: 'hot',
    attempts: 10,
    nsfw: false,
    autolaunch: false
  }
});
let win = null;
let tray = null;

console.log('Using config file ' + config.path);

if (app.dock)
  app.dock.hide();

app.on('ready', function() {
  tray = new Tray(iconPath);

  var contextMenu = Menu.buildFromTemplate([{
    label: 'Preferences...',
    accelerator: 'CmdOrCtrl+,',
    click: function() {
      if (win) {
        win.focus();
      } else {
        createPreferencesWindow();
      }
    }
  }, {
    type: 'separator'
  }, {
    label: 'Generate Background',
    accelerator: 'CmdOrCtrl+R',
    type: 'normal',
    click: function(item) {
      generateNewWallpaper(0);
      notifier.notify({
        title: 'deskly',
        message: 'Finding desktop backgrounds..'
      });
    }
  }, {
    label: 'Copy Background Path',
    accelerator: 'CmdOrCtrl+C',
    type: 'normal',
    click: function(item) {
      wallpaper.get().then(function(path) {
        ncp.copy(path);
      });
    }
  }, {
    label: 'Options',
    submenu: [{
      label: 'Allow NSFW Images',
      type: 'checkbox',
      checked: config.get('nsfw'),
      click: function(item) {
        config.set('nsfw', item.checked);
      }
    }, {
      label: 'Start App On Login',
      type: 'checkbox',
      checked: config.get('autolaunch'),
      click: function(item) {
        config.set('autolaunch', item.checked);
      }
    }]
  }, {
    type: 'separator'
  }, {
    label: 'Quit',
    accelerator: 'CmdOrCtrl+Q',
    selector: 'terminate:',
  }]);

  tray.setContextMenu(contextMenu);
});

app.on('window-all-closed', function() {
  // Do nothing
})

function createPreferencesWindow() {
  win = new BrowserWindow({
    width: 450,
    height: 500,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Preferences'
  })

  win.loadURL(`file://${__dirname}/views/index.pug`);
  win.on('closed', function() {
    win = null;
  });
};

function generateNewWallpaper(attempts) {
  if (++attempts < config.get('attempts')) {
    let subreddits = config.get('subreddits');
    let subreddit = subreddits[Math.floor(Math.random() * subreddits.length)];

    console.log('Attempt #' + attempts + ' to generate wallpaper from /r/' + subreddit);
    needle.get('https://www.reddit.com/r/' + subreddit + '/.json?sort=' + config.get('sorttype') + '&limit=50', function(error, response) {
      if (!error && response.statusCode == 200) {
        let posts = response.body.data.children;
        let post = posts[Math.floor(Math.random() * posts.length)].data;
        let nsfw = post.over_18;
        let id = post.id;
        let url = post.url;
        let domain = post.domain;
        let hint = post.post_hint;

        if (!config.get('nsfw') && nsfw) {
          console.log('NSFW wallpaper found ' + url + ' skipping..');
          generateNewWallpaper(attempts);
          return;
        }

        if (url && hint == 'image') {
          needle.get(url, function(error, res) {
            if (!error && res.statusCode == 200) {
              let filePath = app.getPath('downloads') + '/' + id + '.jpg';

              console.log('Downloading ' + url + ' wallpaper to ' + filePath);
              fs.writeFile(filePath, res.raw, function(err) {
                if (!err) {
                  wallpaper.set(filePath).then(function() {
                    console.log('Setting wallpaper to ' + filePath);
                    notifier.notify({
                      title: 'deskly',
                      message: 'Changed to a new desktop background from /r/' + subreddit + '.',
                      contentImage: filePath
                    });
                  });
                }
              });
            } else {
              generateNewWallpaper(attempts);
            }
          });
        } else {
          console.log('Failed to use ' + url + ' (' + hint + ') skipping..');
          generateNewWallpaper(attempts);
        }
      } else {
        generateNewWallpaper(attempts);
      }
    });
  } else {
    console.log('Aborted, exceeded maximum number of attempts.')
    notifier.notify({
      title: 'deskly',
      message: 'Failed to find desktop backgrounds.. Try again later.'
    });
  }
}
