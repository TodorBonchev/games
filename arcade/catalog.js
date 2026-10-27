import { games as action } from './action-games.js';
import { games as puzzles } from './puzzle-games.js';
import { games as skill } from './skill-games.js';

export const arcadeGames = Object.freeze([
  ...action.map(game => ({ ...game, category: 'Action' })),
  ...puzzles.map(game => ({ ...game, category: 'Puzzles' })),
  ...skill.map(game => ({ ...game, category: 'Creative' })),
]);
export const arcadeById = new Map(arcadeGames.map(game => [game.id, game]));
