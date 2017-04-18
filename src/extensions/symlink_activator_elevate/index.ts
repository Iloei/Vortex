import {IExtensionApi, IExtensionContext} from '../../types/IExtensionContext';
import * as elevatedT from  '../../util/elevated';
import lazyRequire from '../../util/lazyRequire';
import { log } from '../../util/log';
import { activeGameId } from '../../util/selectors';

import LinkingActivator from '../mod_management/LinkingActivator';
import { IModActivator } from '../mod_management/types/IModActivator';

import walk from './walk';

import * as Promise from 'bluebird';
import * as fs from 'fs-extra-promise';
import ipc = require('node-ipc');
import * as path from 'path';

import { remoteCode } from './remoteCode';

const elevated = lazyRequire<typeof elevatedT>('../../util/elevated', __dirname);

class ModActivator extends LinkingActivator {
  public id: string;
  public name: string;
  public description: string;

  private mElevatedClient: any;
  private mOutstanding: string[];
  private mDone: () => void;

  constructor(api: IExtensionApi) {
    super(
        'symlink_activator_elevated', 'Symlink activator (Elevated)',
        'Installs the mods by setting symlinks in the destination directory. ' +
            'This implementation will create the symlinks using a separate process ' +
            'with elevated permissions and therefore works even if NMM2 isn\'t run ' +
            'as administrator.', api);
    this.mElevatedClient = null;
  }

  public prepare(dataPath: string, clean: boolean): Promise<void> {
    return this.startElevated().then(() => super.prepare(dataPath, clean));
  }

  public finalize(dataPath: string): Promise<void> {
    return super.finalize(dataPath).then(() => this.stopElevated());
  }

  public isSupported(state: any): string {
    if (process.platform !== 'win32') {
      return 'Not required on non-windows systems';
    }
    const gameId = activeGameId(state);
    if (this.isGamebryoGame(gameId)) {
      return 'Doesn\'t work wtih the gamebryo engine.';
    }
    return undefined;
  }

  protected linkFile(linkPath: string, sourcePath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.mOutstanding.push(sourcePath);

      ipc.server.emit(this.mElevatedClient, 'link-file',
        { source: sourcePath, destination: linkPath });
      resolve();
    });
  }

  protected unlinkFile(linkPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.mOutstanding.push(linkPath);

      ipc.server.emit(this.mElevatedClient, 'remove-link',
        { destination: linkPath });
      resolve();
    });
  }

  protected purgeLinks(installPath: string, dataPath: string): Promise<void> {
    // purge by removing all symbolic links that point to a file inside
    // the install directory
    return this.startElevated()
    .then(() => walk(dataPath, (iterPath: string, stats: fs.Stats) => {
          if (!stats.isSymbolicLink()) {
            return Promise.resolve();
          }
          return fs.readlinkAsync(iterPath).then((symlinkPath) => {
            if (!path.relative(installPath, symlinkPath).startsWith('..')) {
              ipc.server.emit(this.mElevatedClient, 'remove-link',
                              {destination: iterPath});
            }
          });
        }))
    .then(() => this.stopElevated());
  }

  protected isLink(linkPath: string, sourcePath: string): Promise<boolean> {
    return fs.readlinkAsync(linkPath)
    .then(symlinkPath => symlinkPath === sourcePath)
    // readlink throws an "unknown" error if the file is no link at all. Super helpful
    .catch(() => false);
  }

  private startElevated(): Promise<void> {
    this.mOutstanding = [];
    this.mDone = null;
    const ipcPath: string = 'nmm_elevate_symlink';
    return new Promise<void>((resolve, reject) => {
      ipc.serve(ipcPath, () => {
        ipc.server.on('initialised', (data, socket) => {
          this.mElevatedClient = socket;
          resolve();
        });
        ipc.server.on('finished', (modPath: string) => {
          this.mOutstanding.splice(this.mOutstanding.indexOf(modPath), 1);
          if ((this.mOutstanding.length === 0) && (this.mDone !== null)) {
            this.finish();
          }
        });
        ipc.server.on('socket.disconnected', () => {
          ipc.server.stop();
          this.mElevatedClient = null;
        });
        ipc.server.on('log', (data: any) => {
          log(data.level, data.message, data.meta);
        });
        return elevated.default(ipcPath, remoteCode, { gugu: 42 }, __dirname);
      });
      ipc.server.start();
    });
  }

  private stopElevated() {
    return new Promise<void>((resolve, reject) => {
      this.mDone = () => {
        resolve();
      };
      if (this.mOutstanding.length === 0) {
        this.finish();
      }
    });
  }

  private finish() {
    ipc.server.emit(this.mElevatedClient, 'quit');
    ipc.server.stop();
    this.mDone();
  }

  private isGamebryoGame(gameId: string): boolean {
    return ['skyrim', 'skyrimse', 'fallout4', 'falloutnv', 'oblivion'].indexOf(gameId) !== -1;
  }
}

export interface IExtensionContextEx extends IExtensionContext {
  registerModActivator: (activator: IModActivator) => void;
}

function init(context: IExtensionContextEx): boolean {
  context.registerModActivator(new ModActivator(context.api));

  return true;
}

export default init;
