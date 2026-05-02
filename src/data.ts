import type { Character, Skill } from './types';

export const CHARACTERS: Character[] = [
  {
    id: 'monk',
    name: 'The Monk',
    flavor: [
      'The holiest of people, monks come from all walks of life, whether they are rich or poor. Monks devote their life to the teachings of their deity, living a secluded, quiet life in the monastery. Monks must take three vows that they keep sacred — the Vow of Poverty, the Vow of Chastity and the Vow of Obedience.',
      'Monks are very well respected in society. Monks have excellent penmanship, having been taught the art of calligraphy in the monastery. However, they tend to write matter-of-factly.',
      'The female version of the monk is the nun.',
    ],
    attributes: { penmanship: 'good', language: 'average', heart: 'poor' },
  },
  {
    id: 'knight',
    name: 'The Knight',
    flavor: [
      'The knight is the bastion of chivalry and romance. Tales are told of great knights and their bravery in the battlefield.',
      'Knights embark upon grand quests, often given by the King or Queen — whether it is to save a village from marauders or to rid a forest of boggarts.',
      'It is worth noting that knights can be either men or women.',
      'While knights write with all their heart, they do not have the best grasp of language.',
    ],
    attributes: { penmanship: 'average', language: 'poor', heart: 'good' },
  },
  {
    id: 'poet',
    name: 'The Poet',
    flavor: [
      'The poet is a master of language — able to create beauty with just a quill and parchment.',
      'Many poets form literary groups, or Poet Corners, where they meet and discuss their works. Some will even read out loud their epic works in front of an audience for payment.',
      "Because the poet is more concerned with the words on the page rather than how they are presented, their penmanship isn't the best.",
    ],
    attributes: { penmanship: 'poor', language: 'good', heart: 'average' },
  },
  {
    id: 'aristocrat',
    name: 'The Aristocrat',
    flavor: [
      'The aristocracy represents the most wealthy and privileged people in society. They have everything they could ever need — stately homes, valuable trinkets and servants at their disposal.',
      'Naturally aristocrats have a high standing in society, although not all are respected as many are seen as pompous and arrogant, throwing their money away on frivolous things rather than aiding those less fortunate.',
    ],
    attributes: { penmanship: 'good', language: 'poor', heart: 'average' },
  },
  {
    id: 'scholar',
    name: 'The Scholar',
    flavor: [
      'Scholars are the great minds of the world — studying subjects like mathematics, literature, botany and geography.',
      'The halls of universities are packed with scholars, some of which teach while others study their discipline in the library.',
      'Scholars are well-educated, so their grasp of language is second-to-none.',
    ],
    attributes: { penmanship: 'average', language: 'good', heart: 'poor' },
  },
  {
    id: 'courtier',
    name: 'The Courtier',
    flavor: [
      'Walking the halls of power, the courtier is a social butterfly who aims to climb the ranks through flattery and intrigue. They live within the walls of palaces and castles, aiding the monarchy with their duties.',
      'Courtiers are experts at winning people over and gaining their trust, although they are known to play people off against each other through deception in order to get ahead.',
    ],
    attributes: { penmanship: 'poor', language: 'average', heart: 'good' },
  },
];

export const SKILLS: Skill[] = [
  {
    id: 'inspiration',
    name: 'Inspiration',
    description:
      'You are a born leader, with the ability to use powerful language to inspire others in your letters. Gain +1 die to a Language test.',
    bonusAttribute: 'language',
  },
  {
    id: 'illumination',
    name: 'Illumination',
    description:
      'You have studied the art of calligraphy and manuscript illumination, able to conjure incredible works from the tip of your pen. Gain +1 die to a Penmanship test.',
    bonusAttribute: 'penmanship',
  },
  {
    id: 'augmentation',
    name: 'Augmentation',
    description:
      'You are an emotive writer with the ability to describe a scene in such a way to transport the reader with your language. Gain +1 die to a Heart test.',
    bonusAttribute: 'heart',
  },
];

export function characterById(id: string): Character | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

export function skillById(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}
