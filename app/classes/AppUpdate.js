'use strict';

import { dialog, BrowserWindow, remote, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { isConnected } from '../utils/isOnline';
import { log } from '../utils/log';
import { isPackaged } from '../utils/isPackaged';
import { PATHS } from '../utils/paths';
import { ENABLE_BACKGROUND_AUTO_UPDATE } from '../constants';

let progressbarWindow = null;
let isFileTransferActiveFlag = false;
let isFileTransferActiveSeekFlag = false;

const createChildWindow = ({ mainWindow }) => {
  return new BrowserWindow({
    parent: mainWindow,
    modal: true,
    show: true,
    height: 150,
    width: 600,
    title: 'Progress...',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: false
  });
};

const fireProgressbar = ({ mainWindow }) => {
  if (progressbarWindow) {
    progressbarWindow.focus();
    return null;
  }

  mainWindow.webContents.send('isFileTransferActiveSeek', {
    check: true
  });

  if (!isFileTransferActiveSeekFlag) {
    ipcMain.on('isFileTransferActiveReply', (event, { ...args }) => {
      const { isActive } = args;

      isFileTransferActiveFlag = isActive;
    });
    isFileTransferActiveSeekFlag = true;
  }

  progressbarWindow = createChildWindow({ mainWindow });
  progressbarWindow.loadURL(`${PATHS.loadUrlPath}#progressbarPage`);
  progressbarWindow.on('closed', function() {
    progressbarWindow = null;
  });
};

export default class AppUpdate {
  constructor({ mainWindow }) {
    this.autoUpdater = autoUpdater;
    if (!isPackaged) {
      this.autoUpdater.updateConfigPath = PATHS.appUpdateFile;
    }
    this.autoUpdater.autoDownload = ENABLE_BACKGROUND_AUTO_UPDATE;

    this.mainWindow = mainWindow;
    this.domReadyFlag = null;
    this.updateInitFlag = false;
    this.updateForceCheckFlag = false;
  }

  init() {
    if (this.updateInitFlag) {
      return;
    }

    this.autoUpdater.on('error', error => {
      const errorMsg =
        error == null ? 'unknown' : (error.stack || error).toString();

      this.setTaskBarProgressBar(-1);
      if (progressbarWindow !== null) {
        progressbarWindow.close();
      }

      dialog.showErrorBox(`Update Error`, `${errorMsg}`);
      log.doLog(error);
    });

    this.autoUpdater.on('update-available', () => {
      this.setTaskBarProgressBar(-1);
      if (progressbarWindow !== null) {
        progressbarWindow.close();
      }

      dialog.showMessageBox(
        {
          type: 'info',
          title: 'Updates Found',
          message: 'New version available. Update the app now?',
          buttons: ['Yes', 'No']
        },
        buttonIndex => {
          switch (buttonIndex) {
            case 0:
              this.initDownloadUpdatesProgress();
              this.autoUpdater.downloadUpdate();
              break;
            default:
            case 1:
              return;
              break;
          }
        }
      );
    });

    this.autoUpdater.on('download-progress', progress => {
      if (progressbarWindow === null) {
        return null;
      }

      this.setUpdateProgressWindow({ value: progress.percent || 0 });
    });

    this.autoUpdater.on('update-downloaded', () => {
      this.setTaskBarProgressBar(-1);
      if (progressbarWindow !== null) {
        progressbarWindow.close();
      }

      dialog.showMessageBox(
        {
          title: 'Install Updates',
          message: 'Updates downloaded. Application will quit now...',
          buttons: ['Install and Relaunch']
        },
        buttonIndex => {
          switch (buttonIndex) {
            case 0:
            default:
              this.autoUpdater.quitAndInstall();
              break;
          }
        }
      );
    });

    this.updateInitFlag = true;

    try {
    } catch (e) {
      log.error(e, `AppUpdate -> init`);
    }
  }

  checkForUpdates() {
    this.autoUpdater.checkForUpdates();
  }

  forceCheck() {
    if (!this.updateForceCheckFlag) {
      this.autoUpdater.on('checking-for-update', () => {
        this.setCheckUpdatesProgress();
      });

      this.autoUpdater.on('update-not-available', () => {
        this.setTaskBarProgressBar(-1);
        if (progressbarWindow !== null) {
          progressbarWindow.close();
        }
        dialog.showMessageBox(
          {
            title: 'No Updates Found',
            message: 'You have the latest version installed.',
            buttons: ['Close']
          },
          buttonIndex => {
            switch (buttonIndex) {
              case 0:
              default:
                break;
            }
          }
        );
      });
    }

    this.autoUpdater.checkForUpdates();
    this.updateForceCheckFlag = true;
    try {
    } catch (e) {
      log.error(e, `AppUpdate -> forceCheck`);
    }
  }

  setCheckUpdatesProgress() {
    isConnected().then(connected => {
      if (!connected) {
        dialog.showMessageBox(
          {
            title: 'Checking For Updates',
            message: 'Internet connection is unavailable.',
            buttons: ['Close']
          },
          buttonIndex => {
            switch (buttonIndex) {
              case 0:
              default:
                return;
                break;
            }
          }
        );
        return null;
      }

      fireProgressbar({ mainWindow: this.mainWindow });
      this.setTaskBarProgressBar(2);
      
      progressbarWindow.webContents.once('dom-ready', () => {
        progressbarWindow.webContents.send('progressBarDataCommunication', {
          progressTitle: `Checking For Updates`,
          progressBodyText: `Please wait...`,
          value: 0,
          variant: `indeterminate`
        });
      });
    });
  }

  initDownloadUpdatesProgress() {
    isConnected().then(connected => {
      if (!connected) {
        dialog.showMessageBox(
          {
            title: 'Downloading Updates',
            message: 'Internet connection is unavailable.',
            buttons: ['Close']
          },
          buttonIndex => {
            switch (buttonIndex) {
              case 0:
              default:
                return;
                break;
            }
          }
        );
        return null;
      }

      fireProgressbar({ mainWindow: this.mainWindow });
      this.domReadyFlag = false;
      this.setUpdateProgressWindow({ value: 0 });
    });
  }

  setUpdateProgressWindow({ value = 0 }) {
    let data = {
      progressTitle: `Downloading Updates`,
      progressBodyText: `Please wait...`,
      value: value,
      variant: `determinate`
    };

    this.setTaskBarProgressBar(value / 100);
    if (this.domReadyFlag) {
      progressbarWindow.webContents.send('progressBarDataCommunication', data);
      return null;
    }

    progressbarWindow.webContents.once('dom-ready', () => {
      progressbarWindow.webContents.send('progressBarDataCommunication', data);

      this.domReadyFlag = true;
    });
  }

  setTaskBarProgressBar(value) {
    if (isFileTransferActiveFlag) {
      return null;
    }

    this.mainWindow.setProgressBar(value);
  }
}