import type {
  GamePlayer,
  WorldSeed,
  ChatMessage,
  Transcript,
  VoteEntry,
  LocationDecision,
  DayScript,
} from '../types/game'

// ── Oyuncular ──────────────────────────────────────────

export const PLAYERS: GamePlayer[] = [
  { id: 'p0', name: 'Dorin',     roleTitle: 'Kasap',          playerType: 'et_can',        alive: true, avatarColor: '#D35400' },
  { id: 'p1', name: 'Mirra',     roleTitle: 'Sifaci',         playerType: 'et_can',        alive: true, avatarColor: '#1ABC9C' },
  { id: 'p2', name: 'Fenris',    roleTitle: 'Ejderha Avcisi', playerType: 'yanki_dogmus',  alive: true, avatarColor: '#8E44AD' },
  { id: 'p3', name: 'Seraphine', roleTitle: 'Ozan',           playerType: 'et_can',        alive: true, avatarColor: '#E67E22' },
  { id: 'p4', name: 'Kael',      roleTitle: 'Balikci',        playerType: 'yanki_dogmus',  alive: true, avatarColor: '#2C3E50' },
  { id: 'p5', name: 'Lyra',      roleTitle: 'Terzi',          playerType: 'et_can',        alive: true, avatarColor: '#C0392B' },
]

export const SELF_PLAYER_ID = 'p0' // Dorin = insan oyuncu

// ── Dunya ──────────────────────────────────────────────

export const WORLD_SEED: WorldSeed = {
  settlementName: 'Kul Ocagi',
  tone: 'karanlik_masalsi',
  season: 'kis_sonu',
  fireColor: 'kehribar',
  fireColorMood: 'Sicak ve guven veren, ama aldatici.',
  exilePhrase: 'Cember disina adim at. Atesin seni artik tanimiyor.',
  handRaisePhrase: 'Ates isterim.',
  omens: [
    'Kuzgunlar cemberin ustunde uc tur atti.',
    'Sabah ciginde kan rengi izler bulundu.',
  ],
}

// ── Gun 1 ──────────────────────────────────────────────

const DAY1_CAMPFIRE_OPEN: ChatMessage[] = [
  {
    id: 'd1co1', sender: 'Ocak Bekcisi', isSelf: false, isSystem: true, timestamp: 1,
    text: 'Ocak Yemini titredi. Sozunuzu tartın, geceyi dinleyin.',
  },
  {
    id: 'd1co2', sender: 'Fenris', isSelf: false, timestamp: 2,
    text: 'Atesin golgesinde bir sey kipirdıyor. Duydunuz mu?',
  },
  {
    id: 'd1co3', sender: 'Mirra', isSelf: false, timestamp: 3,
    text: 'Ben bir sey duymadim. Ilk geceyi sakin gecirmek lazim.',
  },
  {
    id: 'd1co4', sender: 'Kael', isSelf: false, timestamp: 4,
    text: 'Sakinlik iyi de... Fenris neden bu kadar tedirgin? Bir sey mi biliyorsun?',
  },
  {
    id: 'd1co5', sender: 'Seraphine', isSelf: false, timestamp: 5,
    text: 'Sarkılarımda bir isim yankilanıyor ama kimin oldugunu cikartamıyorum.',
  },
  {
    id: 'd1co6', sender: 'Lyra', isSelf: false, timestamp: 6,
    text: 'Fenris\'in omzunda yeni bir yara izi var. Dun yoktu. Bunu acikla.',
  },
]

const DAY1_FREE_ROAM: LocationDecision[] = [
  { playerName: 'Dorin',     choice: 'VISIT|Fenris', displayText: 'Dorin, Fenris\'in evine gitti.' },
  { playerName: 'Mirra',     choice: 'CAMPFIRE',     displayText: 'Mirra ates basinda kaldi.' },
  { playerName: 'Fenris',    choice: 'HOME',          displayText: 'Fenris evine cekildi.' },
  { playerName: 'Seraphine', choice: 'CAMPFIRE',     displayText: 'Seraphine ates basinda kaldi.' },
  { playerName: 'Kael',      choice: 'VISIT|Lyra',   displayText: 'Kael, Lyra\'nin evine gitti.' },
  { playerName: 'Lyra',      choice: 'HOME',          displayText: 'Lyra evine cekildi.' },
]

const DAY1_HOUSE: Transcript[] = [
  { id: 'h1', speaker: 'opponent', text: 'Dorin... Neden benim evime geldin? Bir sey mi duydun?' },
  { id: 'h2', speaker: 'me',       text: 'Lyra senin omzundaki yaradan bahsetti. Acikla bunu.' },
  { id: 'h3', speaker: 'opponent', text: 'Yara mi? Dagdan donerken oldu. Herkes bilir benim daglarla isim.' },
  { id: 'h4', speaker: 'me',       text: 'Ama hikaye her seferinde degisiyor Fenris. Dun baska anlattın.' },
]

const DAY1_CAMPFIRE_CLOSE: ChatMessage[] = [
  {
    id: 'd1cc1', sender: 'Dorin', isSelf: true, timestamp: 10,
    text: 'Fenris\'le konustum. Yara hikayesi her seferinde degisiyor. Guvenemiyorum.',
  },
  {
    id: 'd1cc2', sender: 'Fenris', isSelf: false, timestamp: 11,
    text: 'Hikaye degismiyor! Detaylari karistirıyorsun Dorin. Bu bir tuzak.',
  },
  {
    id: 'd1cc3', sender: 'Kael', isSelf: false, timestamp: 12,
    text: 'Lyra\'yla konustum. Gayet samimi biri. Bence asil suphe Fenris\'te.',
  },
  {
    id: 'd1cc4', sender: 'Seraphine', isSelf: false, timestamp: 13,
    text: 'Iki kisi Fenris diyor. Bu kadar duman varsa bir ates vardir.',
  },
]

const DAY1_VOTES: VoteEntry[] = [
  { voter: 'Dorin',     target: 'Fenris' },
  { voter: 'Mirra',     target: 'Fenris' },
  { voter: 'Fenris',    target: 'Dorin' },
  { voter: 'Seraphine', target: 'Fenris' },
  { voter: 'Kael',      target: 'Fenris' },
  { voter: 'Lyra',      target: 'Kael' },
]

// ── Gun 2 ──────────────────────────────────────────────

const DAY2_CAMPFIRE: ChatMessage[] = [
  {
    id: 'd2c1', sender: 'Ocak Bekcisi', isSelf: false, isSystem: true, timestamp: 20,
    text: 'Karanlik bir gun daha basliyor. Dikkatli olun.',
  },
  {
    id: 'd2c2', sender: 'Kael', isSelf: false, timestamp: 21,
    text: 'Fenris gitti ama icimde hala bir huzursuzluk var. Birimiz daha sahte.',
  },
  {
    id: 'd2c3', sender: 'Mirra', isSelf: false, timestamp: 22,
    text: 'Kael, dun Lyra\'yla cok uzun konustun. Ne konustunuz orada?',
  },
  {
    id: 'd2c4', sender: 'Kael', isSelf: false, timestamp: 23,
    text: 'Normal sohbet ettik. Neden supheleniyorsun? Sifaci olarak herkesi mi dinliyorsun?',
  },
  {
    id: 'd2c5', sender: 'Lyra', isSelf: false, timestamp: 24,
    text: 'Aslinda Kael tuhaf sorular sordu. Gecmisimi test ediyormus gibi hissettim.',
  },
]

const DAY2_VOTES: VoteEntry[] = [
  { voter: 'Dorin',     target: 'Kael' },
  { voter: 'Mirra',     target: 'Kael' },
  { voter: 'Seraphine', target: 'Kael' },
  { voter: 'Kael',      target: 'Mirra' },
  { voter: 'Lyra',      target: 'Kael' },
]

// ── Gun Scriptleri ─────────────────────────────────────

export const DAY_SCRIPTS: DayScript[] = [
  {
    morningText: 'Uyanin Kul Ocagi. 6 kisi hayatta. Gece sessiz gecti ama kuzgunlar cemberin ustunde uc tur atti. Ates basina gelin.',
    campfireOpen: DAY1_CAMPFIRE_OPEN,
    freeRoamDecisions: DAY1_FREE_ROAM,
    houseTranscript: DAY1_HOUSE,
    houseVisitor: 'Dorin',
    houseHost: 'Fenris',
    campfireClose: DAY1_CAMPFIRE_CLOSE,
    votes: DAY1_VOTES,
    exiledName: 'Fenris',
    exiledType: 'yanki_dogmus',
  },
  {
    morningText: 'Fenris surgun edildi. 5 kisi kaldi. Sabah ciginde kan rengi izler bulundu. Dikkatli olun.',
    campfireOpen: DAY2_CAMPFIRE,
    votes: DAY2_VOTES,
    exiledName: 'Kael',
    exiledType: 'yanki_dogmus',
  },
]
