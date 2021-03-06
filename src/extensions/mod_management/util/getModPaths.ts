import { IState } from "../../../types/IState";
import { getGame } from "../../gamemode_management/util/getGame";
import { currentGameDiscovery } from "../../../util/selectors";

function getModPaths(state: IState, gameId: string): { [typeId: string]: string } {
  const game = getGame(gameId);
  if (game === undefined) {
    return undefined;
  }
  const discovery = currentGameDiscovery(state);
  if ((discovery === undefined) || (discovery.path === undefined)) {
    return undefined;
  }
  return game.getModPaths(discovery.path);
}

export default getModPaths;
