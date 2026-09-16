import type { Scenario } from './types';

// Scenario content from the Quill rulebook by Scott Malthouse.
// Array order drives the Setup screen's scenario list.
export const SCENARIOS: Scenario[] = [
  {
    id: 'archduke',
    title: 'The Archduke',
    profile: [
      'You are corresponding with the Archduke Godfrey, a powerful member of the royal family who is known for his serious demeanour.',
      'You are writing to give your condolences for the passing of his sister, Mary of Linchester. She came down with the consumption and passed a week ago. You were acquainted with her, having been in the same school when you were young. You will bring up your past and what you both did when you were children.',
    ],
    rulesOfCorrespondence: [
      {
        type: 'dice_bonus',
        attribute: 'heart',
        amount: 1,
        appliesTo: { characters: ['courtier', 'aristocrat'] },
        description: 'Courtiers and Aristocrats gain an extra Heart die in this scenario',
      },
      {
        type: 'dice_bonus',
        attribute: 'penmanship',
        amount: 1,
        description:
          'You are using a superior parchment in this missive. Gain an extra Penmanship die.',
      },
    ],
    inkPot: [
      { inferior: 'Climbing Trees', superior: 'Scaling Oaks' },
      { inferior: 'Death', superior: 'Passing' },
      { inferior: 'Teachers', superior: 'Scholars' },
      { inferior: 'Rode Horses', superior: 'Rode Stallions' },
      { inferior: 'Town', superior: 'Riverton' },
      { inferior: 'Ducks', superior: 'Mallards' },
      { inferior: 'Angels', superior: 'Seraphim' },
      { inferior: 'Fields', superior: 'Heather Fields' },
      { inferior: 'Church', superior: 'Cathedral of Light' },
      { inferior: 'Young Boy', superior: 'Young Harold of Whent' },
    ],
    consequences: {
      unsuccessful:
        'The Archduke is disgusted by your letter. You have lost his respect and will no longer be in contact with you.',
      tepid:
        'The Archduke responds kindly, but is quick to criticise your letter. You will unlikely hear from him for some months.',
      favourable:
        'The Archduke thanks you for your kind letter. He invites you over next week to stay on his estate.',
      excellent:
        'The Archduke thanks you profusely for your excellent letter and promises that you will be repaid for your kindness with a gift of great worth.',
    },
  },
  {
    id: 'art-dealer',
    title: 'The Art Dealer',
    profile: [
      'You are corresponding with Christina Bowbridge, renowned art dealer who is known for her enthusiastic personality and adoration of the monarchy.',
      'You are writing to inquire about buying a portrait of Prince Edward IV, however you have heard rumours that this painting could be a fake, but you must find this information from Christina without offending her.',
    ],
    rulesOfCorrespondence: [
      {
        type: 'reroll_highest',
        attribute: 'penmanship',
        description:
          'Ms Bowbridge likes to be impressed with beautiful calligraphy so you must take care. When making a Penmanship test, re-roll the highest die and accept the final roll.',
      },
    ],
    inkPot: [
      { inferior: 'The Prince', superior: 'His Royal Highness Prince Edward IV' },
      { inferior: 'Fake', superior: 'Reproduction' },
      { inferior: 'Colours', superior: 'Spectrum' },
      { inferior: "I'm sorry", superior: 'I apologise profusely' },
      { inferior: 'Fountain', superior: 'Great Fountain of Aleah' },
      { inferior: 'Look at', superior: 'Inspect' },
      { inferior: 'Skill', superior: 'Esteemed expertise' },
      { inferior: 'My mum', superior: 'My dear mother' },
      { inferior: 'Signature', superior: 'Inscription' },
      { inferior: 'Tick you off', superior: 'Offend you' },
    ],
    consequences: {
      unsuccessful:
        'Christina takes great offence to your letter and responds with a scathing letter about your character. She will not sell you the painting…ever.',
      tepid:
        "Christina's response is mild, but she has obviously taken some offence. She will sell the painting but for double the price.",
      favourable:
        'Christina is pleased with your letter and responds enthusiastically. She clearly has taken little offence and will sell you the painting.',
      excellent:
        'Christina is overwhelmed by your letter and wishes to give you the painting as a gift.',
    },
  },
  {
    id: 'father',
    title: 'The Father',
    profile: [
      'You are corresponding with Mr Anthony Winsborough, an old friend of yours, whose son, Rupert, was found dead near your residences.',
      "You are writing to inform Anthony of his son's death. You must be sensitive and explain what happened and how you found Rupert.",
    ],
    rulesOfCorrespondence: [
      {
        type: 'dice_bonus',
        attribute: 'language',
        amount: 1,
        appliesTo: { characters: ['monk'] },
        description:
          'Anthony would prefer to hear this news from a person of the cloth. Monks and nuns gain an extra die when rolling Language tests for this scenario.',
      },
    ],
    inkPot: [
      { inferior: 'Your boy', superior: 'Your dear son' },
      { inferior: 'Corpse', superior: 'Body' },
      { inferior: 'Bawdy house', superior: 'Drinking establishment' },
      { inferior: 'Brutal', superior: 'Harrowing' },
      { inferior: "I'm sorry", superior: 'My infinite condolences' },
      { inferior: 'At peace', superior: 'In heaven' },
      { inferior: 'A guard', superior: 'The police' },
      { inferior: 'Sadness', superior: 'Sorrow' },
      { inferior: 'Rain', superior: 'Downpour' },
      { inferior: 'Box', superior: 'Coffin' },
    ],
    consequences: {
      unsuccessful:
        'Anthony responds aggressively, blaming you for not being there for him and for not caring. You no longer hear from Anthony.',
      tepid:
        "Anthony's is clearly disappointed in how you have relayed the information to him, but he does not blame you.",
      favourable:
        'Anthony thanks you for telling him about his son and invites you to his funeral.',
      excellent:
        "Anthony commends you for your letter and wishes you to speak at his son's funeral.",
    },
  },
  {
    id: 'king',
    title: 'The King',
    profile: [
      'You are corresponding with King Gerald V, who you have only met on one occasion. He is a tyrant and unloved by the populace.',
      'You are writing to inform the King of a suspicious fellow you have seen about town who you believe to be a spy. You must convince him that you are not a raving lunatic and to take your concerns seriously, while being cordial.',
    ],
    rulesOfCorrespondence: [
      {
        type: 'dice_bonus',
        attribute: 'penmanship',
        amount: 1,
        description:
          'You are using a high quality parchment and seal. Gain an extra Penmanship die.',
      },
      {
        type: 'dice_bonus',
        attribute: 'heart',
        amount: 1,
        appliesTo: { characters: ['courtier'] },
        description: 'Courtiers gain an extra Heart die this scenario.',
      },
    ],
    inkPot: [
      { inferior: 'Gerald', superior: 'Your Majesty' },
      { inferior: 'Smithy', superior: 'Blacksmith' },
      { inferior: 'Funny man', superior: 'Curious individual' },
      { inferior: 'Hidden', superior: 'Concealed' },
      { inferior: 'Poison', superior: 'Deadly Nightshade' },
      { inferior: 'Big bloke', superior: 'Imposing man' },
      { inferior: 'Cow house', superior: 'Barn' },
      { inferior: 'Furry lip', superior: 'Moustache' },
      { inferior: 'Buggered face', superior: 'Scarred visage' },
      { inferior: 'Worrying', superior: 'Alarming' },
    ],
    consequences: {
      unsuccessful:
        'The King does not respond. Several days after you sent your missive you are visited by the royal guard and brought to prison for your disrespectful letter.',
      tepid:
        'You receive a letter from the captain of the royal guard thanking you, but she does not believe you and does not wish you to write again.',
      favourable:
        'You receive a letter from a senior official close to the King thanking you. You also receive a monetary reward in the letter.',
      excellent:
        "The King writes to you personally with great thanks. He has positioned his guard close by and the spy will be caught. You are invited to the King's court as a guest and hero.",
    },
  },
];
