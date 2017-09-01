import { ILog, ISession } from '../types/iSession';

import * as Promise from 'bluebird';
import { remote } from 'electron';
import * as fs from 'fs-extra-promise';
import * as path from 'path';

export function loadVortexLogs(): Promise<ISession[]> {

  const logPath = remote.app.getPath('userData');
  const sessions: ISession[] = [];

  return fs.readdirAsync(logPath)
    .then((logPathFiles: string[]) => {
      const logFiles = logPathFiles.filter((file) => path.extname(file) ===
        '.log').sort((lhs: string, rhs: string) => rhs.localeCompare(lhs));
      return Promise.each(logFiles, (logFileName: string) => {
        return fs.readFileAsync(path.join(logPath, logFileName), 'utf8')
          .then(text => {
            const splittedSessions = text.split('- info: --------------------------');

            splittedSessions.forEach((sessionElement, sessionIndex) => {

              const splittedLogs = sessionElement.split('\r\n');
              const logElements: ILog[] = [];

              splittedLogs.forEach((element, index) => {
                let textType = '';

                switch (true) {
                  case element.toLowerCase().indexOf('- error:') > -1: textType = 'ERROR'; break;
                  case element.toLowerCase().indexOf('- debug:') > -1: textType = 'DEBUG'; break;
                  case element.toLowerCase().indexOf('- info:') > -1: textType = 'INFO'; break;
                  case element.toLowerCase().indexOf('- warn:') > -1: textType = 'WARNING'; break;
                }

                if (element !== '' && index !== splittedLogs.length - 1) {
                  logElements.push({
                    text: element,
                    type: textType,
                  });
                }
              });

              if (logElements.length > 1) {
                sessions.push({
                  from: sessionElement !== undefined ?
                    sessionElement.substring(0, 31).replace('-', '') : '',
                  to: logElements[logElements.length - 1].text.substring(0, 30),
                  logs: logElements,
                  fullLog: (logElements.map((log) => log.text).join('\n')),
                });
              }
            });
          });
      });
    })
    .then(() => {
      return Promise.resolve(sessions);
    });
}