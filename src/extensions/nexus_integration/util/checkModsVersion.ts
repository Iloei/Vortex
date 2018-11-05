import { log } from '../../../util/log';
import { getSafe } from '../../../util/storeHelper';
import { truthy } from '../../../util/util';
import { nexusGameId } from './convertGameId';

import { gameById } from '../../gamemode_management/selectors';
import { setModAttribute, setModAttributes } from '../../mod_management/actions/mods';
import { IMod } from '../../mod_management/types/IMod';

import * as Promise from 'bluebird';
import * as I18next from 'i18next';
import NexusT, { IFileInfo, IFileUpdate, IModFiles, IModInfo, NexusError } from 'nexus-api';
import * as Redux from 'redux';
import * as semvish from 'semvish';

/**
 * check if there is a newer mod version on the server
 *
 * @param {NexusT} nexus
 * @param {string} gameId
 * @param {string} modId
 * @param {number} newestFileId
 * @param {string} version
 * @param {number} uploadedTimestamp
 * @return {Promise<IFileInfo>} updatedMod
 *
 */
export function checkModVersion(store: Redux.Store<any>, nexus: NexusT,
                                gameMode: string, mod: IMod): Promise<void> {
  const nexusModId: number =
      parseInt(getSafe(mod.attributes, ['modId'], undefined), 10);

  if (isNaN(nexusModId)) {
    return Promise.resolve();
  }

  const gameId = getSafe(mod.attributes, ['downloadGame'], undefined) || gameMode;
  const game = gameById(store.getState(), gameId);

  return Promise.resolve(nexus.getModFiles(nexusModId,
    nexusGameId(game)))
      .then(result => updateFileAttributes(store.dispatch, gameMode, mod, result));
}

/**
 * based on file update information, find the newest version of the file
 * @param fileUpdates
 * @param fileId
 */
function findLatestUpdate(fileUpdates: IFileUpdate[], updateChain: IFileUpdate[], fileId: number) {
  const updatedFile = fileUpdates.find(file => file.old_file_id === fileId);
  if (updatedFile !== undefined) {
    return findLatestUpdate(fileUpdates,
      updateChain.concat([ updatedFile ]), updatedFile.new_file_id);
  } else {
    return updateChain;
  }
}

function updateModAttributes(dispatch: Redux.Dispatch<any>,
                             gameId: string,
                             mod: IMod,
                             modInfo: IModInfo) {
  const attributes: any = {
    'shortDescription': modInfo.summary,
    'description': modInfo.description,
    'pictureUrl': modInfo.picture_url,
    'author': modInfo.author,
  };

  if (modInfo.endorsement !== undefined) {
    attributes.endorsed = modInfo.endorsement.endorse_status;
  }
  if (getSafe(mod.attributes, ['category'], undefined) === undefined) {
    attributes.category = modInfo.category_id;
  }

  dispatch(setModAttributes(gameId, mod.id, attributes));
}

function updateLatestFileAttributes(dispatch: Redux.Dispatch<any>,
                                    gameId: string,
                                    mod: IMod,
                                    file: IFileInfo,
                                    changelog: string) {
  const attributes = {
    newestVersion:  file.version,
    newestFileId: ((file.category_name === 'OLD_VERSION') || !truthy(file.category_name))
      // file was removed from mod or is old, either way there should be a new version available
      // but we have no way of determining which it is.
      ? 'unknown'
      : file.file_id,
    newestChangelog: (changelog.length > 0)
      ? { format: 'html', content: changelog }
      : undefined,
  };

  dispatch(setModAttributes(gameId, mod.id, attributes));
}

function updateFileAttributes(dispatch: Redux.Dispatch<any>,
                              gameId: string,
                              mod: IMod,
                              files: IModFiles) {
  const fileId = getSafe(mod.attributes, ['fileId'], undefined);
  const latestFileId = fileId;
  let fileUpdates: IFileUpdate[] = findLatestUpdate(files.file_updates, [], latestFileId);
  if (fileUpdates.length === 0) {
    // update not found through update-chain. If there is only a single file that
    // isn't marked as old we assume that is the right update.
    const notOld = files.files.filter(file => (file.category_id !== 4) && (file.category_id !== 6));
    if ((notOld.length === 1) && (notOld[0].file_id !== fileId)) {
      fileUpdates = [{
        old_file_id: fileId,
        old_file_name: getSafe(mod.attributes, ['logicalFileName'], undefined),
        new_file_id: notOld[0].file_id,
        new_file_name: notOld[0].file_name,
        uploaded_time: notOld[0].uploaded_time,
        uploaded_timestamp: notOld[0].uploaded_timestamp,
      }];
    }
  }

  // collect the changelogs of all the versions > currently installed and <= newest
  const changelog = fileUpdates
    .map(fileUpdate => {
      const file = files.files.find(iter => iter.file_id === fileUpdate.new_file_id);
      return file !== undefined ? file.changelog_html : undefined;
    })
    .filter(change => change !== undefined)
    .join('</br>');

  let updatedFile = fileUpdates.length > 0
    ? files.files.find(file => file.file_id === fileUpdates[fileUpdates.length - 1].new_file_id)
    : files.files.find(file => file.file_id === fileId);
  if ((updatedFile === undefined) && truthy(mod.attributes.version)) {
    try {
      updatedFile = files.files.find(file => semvish.eq(file.mod_version, mod.attributes.version));
    } catch(err) {}
  }
  if (updatedFile !== undefined) {
    updateLatestFileAttributes(dispatch, gameId, mod, updatedFile, changelog);
  }
}

function errorFromNexus(err: NexusError): Error {
  if (err.statusCode >= 500) {
    return new Error(`Internal server error (${err.statusCode}, ${err.request}):` + err.message);
  } else if (err.statusCode >= 400) {
    return new Error(`Not found (${err.statusCode}, ${err.request}): ` + err.message);
  } else {
    return new Error(`${err.message} (${err.statusCode}, ${err.request})`);
  }
}

export function retrieveModInfo(
  nexus: NexusT,
  store: Redux.Store<any>,
  gameMode: string,
  mod: IMod,
  t: I18next.TranslationFunction): Promise<void> {
  const nexusModId: string = getSafe(mod.attributes, ['modId'], undefined);
  if ((nexusModId === undefined) || (nexusModId.length === 0)) {
    return Promise.resolve();
  }
  const gameId = getSafe(mod.attributes, ['downloadGame'], gameMode);
  const nexusIdNum = parseInt(nexusModId, 10);
  // if the endorsement state is unknown, request it
  return Promise.resolve(nexus.getModInfo(nexusIdNum, nexusGameId(gameById(store.getState(), gameId))))
    .then((modInfo: IModInfo) => {
      if (modInfo !== undefined) {
        updateModAttributes(store.dispatch, gameMode, mod, modInfo);
      }
    })
    .catch((err: NexusError) => {
      if (err.statusCode === 404) {
        return;
      }
      log('warn', 'An error occurred looking up a mod', {
        error: errorFromNexus(err),
        gameId,
        modId: nexusModId,
      });
      // prevent this error from coming up every time the icon is re-rendered
      store.dispatch(setModAttribute(gameMode, mod.id, 'endorsed', 'Undecided'));
    });
}
