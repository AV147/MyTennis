// ===== CARD CLASS =====
class Card {
  constructor(name, description, power, spin, type, special = {}) {
    this.name = name;
    this.description = description;
    this.power = power;
    this.spin = spin;
    this.type = type; // "serve" or "return"
    
    // Special mechanic properties
    this.guided = special.guided || false;        // Requires +1 to skill check
    this.approach = special.approach || false;    // Moves player to net position
    this.complex = special.complex || false;      // Requires +1d3 to skill check
    this.dropshot = special.dropshot || false;    // Forces opponent to net (out of position unless approach)
    this.antiNet = special.antiNet || false;      // Net player always out of position when returning
    this.powershot = special.powershot || false;  // Adds 1d6 to opponent's complexity (not yours)
    this.smashable = special.smashable || false;  // Can be answered with smash
    this.volley = special.volley || false;        // Can only be played at the net
    this.overhead = special.overhead || false;    // Can be played at net (like smash)
    this.direction = special.direction || 'neutral'; // 'line', 'cross', or 'neutral' for positioning
    this.target = special.target || null;         // 'BL', 'BR', or null - for volleys that target specific corners
    this.targetOpposite = special.targetOpposite || false; // dynamically targets the corner opposite to opponent's position

    // Color drives the active-discard bonus mechanic (no color for serves)
    // Mirrors getCardCategory: volley→green, attack→red, defense→blue
    if (type === 'serve') {
      this.color = null;
    } else if (special.volley) {
      this.color = 'green';
    } else if (special.powershot || special.overhead || special.approach || power >= 5) {
      this.color = 'red';
    } else {
      this.color = 'blue';
    }
  }

  // Create a copy of this card (useful for deck building)
  clone() {
    return new Card(
      this.name,
      this.description,
      this.power,
      this.spin,
      this.type,
      {
        guided: this.guided,
        approach: this.approach,
        complex: this.complex,
        dropshot: this.dropshot,
        antiNet: this.antiNet,
        powershot: this.powershot,
        smashable: this.smashable,
        volley: this.volley,
        overhead: this.overhead,
        direction: this.direction,
        target: this.target,
        targetOpposite: this.targetOpposite
        // color is re-derived automatically in the constructor
      }
    );
  }

  // Display card info (useful for debugging)
  toString() {
    const specials = [];
    if (this.guided) specials.push('guided');
    if (this.approach) specials.push('approach');
    if (this.complex) specials.push('complex');
    if (this.dropshot) specials.push('dropshot');
    if (this.antiNet) specials.push('anti-net');
    if (this.powershot) specials.push('powershot');
    if (this.smashable) specials.push('smashable');
    if (this.volley) specials.push('volley');
    if (this.overhead) specials.push('overhead');
    if (this.direction !== 'neutral') specials.push(this.direction);
    if (this.target) specials.push(`target:${this.target}`);
    if (this.targetOpposite) specials.push('targetOpposite');
    
    const specialStr = specials.length > 0 ? ` [${specials.join(', ')}]` : '';
    return `${this.name} (${this.power} power, ${this.spin} spin, ${this.type})${specialStr}`;
  }
}

// ===== CARD LIBRARY =====
const CARD_LIBRARY = {
  FlatServe: new Card(  "Плоская подача", "Сильная плоская подача для давления на оппонента", 11, 0, "serve" ),
  
  KickServe: new Card( "Крученая подача", "Более надежная, но слабая крученая подача", 7, 2, "serve" ),
  
  StrongForehand: new Card("Сильный удар", "Сильный атакующий удар", 6, 2,  "return", {} ),
  
  WeakForehand: new Card( "Слабый удар","Надежный удар для защиты", 4, 2,  "return", {} ),

  Slice: new Card("Резаный", "Защитный удар с хорошим вращением и небольшой силой", 2, 2, "return", {} ),

  StrikeDownTheLine: new Card("Сильный удар по линии","Сильный атакующий удар по линии. Сложный (-1d3 к кубикам). Выбивает игрока у сетки", 6, 2, "return", { complex: true, direction: 'line', antiNet: true }),

  StrikeCrossCourt: new Card("Сильный удар по диагонали", "Сильныq атакующий удар по диагонали. Прицельный (+1 сложность)", 6, 2, "return",{ guided: true, direction: 'cross' }  ),

  SliceDownTheLine: new Card("Резаный по линии","Защитный резаный удар с вращением по линии. Сложный (-1d3 к кубикам)",  2, 2, "return",  { complex: true, direction: 'line' } ),

  SliceCrossCourt: new Card(
    "Резаный по диагонали",
    "Защитный резаный удар с вращением по диагонали. Прицельный (+1 сложность)",
    2,         // power
    2,         // spin
    "return",  // type
    { guided: true, direction: 'cross' }  // guided shot (+1 to skill check)
  ),
  
 WeakDownTheLine: new Card( "Удар по линии","Надежный удар для защиты по линии. Сложный (-1d3 к кубикам)", 4, 2,  "return", {complex: true, direction: 'line' } ),

  WeakCrossCourt: new Card( "Удар по диагонали","Надежный удар для защиты по диагонали. Прицельный (+1 сложность)", 4, 2,  "return",  {guided: true, direction: 'cross' }  ),

  FlatStrike: new Card(
   "Плоский удар",
    "Рискованный сильный плоский удар. +1d6 сила для оппонента",
    5,         // power
    1,         // spin
    "return",  // type
    { powershot: true }  // adds 1d6 to opponent's complexity
  ),
  
  Dropshot: new Card(
    "Удар под сетку",
    "Слабый удар под сетку. Сложный (-1d3 к кубикам)",
    2,         // power
    1,         // spin
    "return",  // type
    { complex: true, dropshot: true }  // +1d3 to skill check, forces opponent to net
  ),
  
   Moonball: new Card(
     "Полусвечка",
    "Неприцельный защитный удар по высокой дуге. Можно отбить смэшем",
     3,         // power
     2,         // spin
     "return",  // type
     { smashable: true }  // can be smashed, but safer than lob
   ),

  ApproachShot: new Card(
  "Выход к сетке с ударом",
    "Средний удар в движении с выходом к сетке",
    3,         // power
    1,         // spin
    "return",  // type
    { approach: true }  // moves player to net position
  ),
  
  ApproachDropShot: new Card(
     "Выход к сетке с укороченным",
    "Выход к сетке с ударом под сетку. Сложный (-1d3 к кубикам)",
    2,         // power
    1,         // spin
    "return",  // type
    { approach: true, dropshot:true, complex:true }  // moves player to net position
  ),

  Lob: new Card(
     "Свечка",
    "Удар по высокой дуге, перебрасывающий оппонента у сетки. Можно отбить смэшем",
    3,         // power
    1,         // spin
    "return",  // type
    { antiNet: true, smashable: true }  // counters net players, can be smashed
  ),
  
  Smash: new Card(
   "Смэш",
    "Сильный удар из-за головы по высокому мячу. +1d6 сила для оппонента",
    6,         // power
    1,         // spin
    "return",  // type
    { powershot: true, overhead: true }  // adds 1d6 to opponent's complexity, can be played at net
  ),

  VolleyLeft: new Card(
    "Удар слета влево",
    "Удар слета в левый угол. Играется только у сетки",
    5,
    1,
    "return",
    { volley: true, target: 'BL' }
  ),
  
  VolleyRight: new Card(
   "Удар слета вправо",
    "Удар слета в правый угол. Играется только у сетки",
    5,
    1,
    "return",
    { volley: true, target: 'BR' }
  ),
  
  VolleyDropshot: new Card(
     "Удар слета под сетку",
    "Удар слета под сетку. Только у сетки. Сложный (-1d3 к кубикам)",
    2,
    1,
    "return",
    { volley: true, dropshot: true, complex: true }
  ),

  SliceVolleyLeft: new Card(
    "Резаный слета влево",
    "Мягкий резаный удар слета в левый угол. Играется только у сетки",
    3,
    1,
    "return",
    { volley: true, target: 'BL' }
  ),

  SliceVolleyRight: new Card(
    "Резаный слета вправо",
    "Мягкий резаный удар слета в правый угол. Играется только у сетки",
    3,
    1,
    "return",
    { volley: true, target: 'BR' }
  ),

  VolleyStrike: new Card(
    "Удар слета",
    "Сильный удар слета в угол, противоположный сопернику. Только у сетки",
    5,
    1,
    "return",
    { volley: true, targetOpposite: true }
  ),

  VolleySlice: new Card(
    "Резаный слета",
    "Мягкий резаный удар слета. Только у сетки",
    2,
    1,
    "return",
    { volley: true }
  )

};

// ===== DECK BUILDER HELPER =====
function buildDeck(cardCounts) {
  const deck = [];
  for (const [cardName, count] of Object.entries(cardCounts)) {
    const card = CARD_LIBRARY[cardName];
    if (!card) {
      console.warn(`Card "${cardName}" not found in library`);
      continue;
    }
    for (let i = 0; i < count; i++) {
      deck.push(card.clone());
    }
  }
  return deck;
}

// ===== PLAYER DECKS =====
const PLAYER_DECKS = [
  // Player 1 deck

  buildDeck({
  KickServe:2,
  StrongForehand:3, 
  WeakForehand:3 ,
  WeakDownTheLine:3, 
  WeakCrossCourt:3,
  Slice:3,
  StrikeDownTheLine: 3,
  StrikeCrossCourt: 3,
  SliceDownTheLine: 3,
  SliceCrossCourt:3,
  FlatStrike: 3,
  Dropshot: 3,
  Moonball: 3,
  ApproachShot: 3,
  ApproachDropShot:3,
  Lob: 3,
  Smash:3,
  VolleyDropshot: 6,
  VolleyStrike: 6,
  VolleySlice: 6,
  }),

  buildDeck({
  KickServe:2,
  StrongForehand:3, 
  WeakForehand:3 ,
  WeakDownTheLine:3, 
  WeakCrossCourt:3,
  Slice:3,
  StrikeDownTheLine: 3,
  StrikeCrossCourt: 3,
  SliceDownTheLine: 3,
  SliceCrossCourt:3,
  FlatStrike: 3,
  Dropshot: 3,
  Moonball: 3,
  ApproachShot: 3,
  ApproachDropShot:3,
  Lob: 3,
  Smash:3,
  VolleyDropshot: 6,
  VolleyStrike: 6,
  VolleySlice: 6,
  })
];

/*
  FlatServe:1,
  KickServe:1,
  StrongForehand:3, 
  WeakForehand:3 ,
  WeakDownTheLine:3, 
  WeakCrossCourt:3,
  Slice:3,
  StrikeDownTheLine: 3,
  StrikeCrossCourt: 3,
  SliceDownTheLine: 3,
  SliceCrossCourt:3,
  FlatStrike: 3,
  Dropshot: 3,
  Moonball: 3,
  ApproachShot: 3,
  ApproachDropShot:3,
  Lob: 3,
  Smash:3,
  VolleyLeft: 3,
  VolleyRight: 3,
  VolleyDropshot: 3
*/