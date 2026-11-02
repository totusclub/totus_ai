/**
 * Dictionary of first names for the personal-data guard. All forms are
 * lower-case with «ё» → «е». Case forms (Анна → Анны, Анне, Анну, Анной…)
 * are generated, so «с Сергеем» or «для Ольги» are caught as well.
 *
 * AMBIGUOUS names are also ordinary words («вера», «роза», «марта» — 8 марта,
 * «рада» — «рада помочь», «света» — много света). They count as a name only
 * when written with a capital letter in the middle of a sentence, or next to
 * a surname / patronymic, or after «меня зовут» and similar.
 */

const FEMALE = `
агата агния ада аделина аида айгуль айгерим алевтина александра алена алина алиса алия алла альбина
амалия амина анастасия ангелина анжела анжелика ани анита анна антонина анфиса арина ариана асель
асия ася белла божена валентина валерия варвара василиса вера вероника виктория виолетта вита
владислава галина гульнара гузель дана дарина дарья диана дина динара доминика ева евгения екатерина
елена елизавета есения жанна жасмин злата зарема зарина зинаида зоя зульфия инга инесса инна ирина
ильмира камила камилла карина каролина кира клавдия клара кристина ксения лада лариса лейла лиана
лидия лилиана лилия лина лия любовь людмила мадина майя маргарита марианна марина мария марьям мариам
марта мелания милана милена мирослава надежда наиля наталья наталия нелли ника николь нина нонна
оксана олеся ольга полина рада раиса регина рената римма роза розалия руслана сабина сабрина
светлана серафима снежана софия софья стефания сусанна таисия тамара татьяна ульяна фатима эвелина
элеонора элина элла эльвира эльмира эльза эмилия эмма юлиана юлия яна ярослава ясмина анаит асмик
гаяне карине лусине нарине нино алсу лиля
аня настя катя лена оля таня маша даша наташа света юля ира женя саша галя валя надя люба люда
лиза вика ксюша поля соня аля лера рита тома тоня зина мила
`

const MALE = `
адам айдар айрат аким алан александр алексей али алик алим алмаз альберт амир анатолий андрей антон
арам арман армен арсен арсений артем артур аслан ахмед ахмет ашот богдан борис вадим валентин
валерий василий вардан вениамин виктор виталий владимир владислав влад всеволод вячеслав гавриил
гагик гарик геворг геннадий георгий герман глеб гор григорий давид давит даниил данил даниэль демид
денис дмитрий евгений егор елисей ефим заур захар зураб иван игнат игорь ильдар илья ильнур ильяс
иосиф ираклий ислам камиль карен карим кирилл клим константин лев левон леван леонид леон лука
магомед макар максим марат марк матвей мехмет мирон мирослав михаил мурат мустафа мухаммад мухаммед
назар наиль нарек никита николай нодар олег оскар отар павел платон петр радик рамиль ратмир реваз
ренат ринат роберт родион роман ростислав руслан рустам рафаэль самвел самир святослав семен сергей
станислав степан сурен тагир тамерлан тенгиз тигран тимофей тимур тихон трофим федор филипп фарид
хасан хусейн шамиль эдгар эдвард эдуард эльдар эмиль эмин эмре эрик юлиан юрий ян ярослав гиорги
миша дима вова коля петя сережа паша костя ваня леша гоша стас слава витя толя юра боря гриша рома
макс тема федя вася саня леня вадик
`

/** Names that are also common words — see the header. */
export const AMBIGUOUS_NAMES = new Set(
  `вера надежда любовь роза лилия слава лев марина роман майя лада ника белла ян мира тома лука ада
   дана лиана тая гор ислам марк паша тема рада жасмин алмаз динара оскар вита марта поля люба света
   костя рома макс
   аля али леня саня соня толя валя давит`
    .split(/\s+/)
    .filter(Boolean),
)

/**
 * The assistant herself — «Маша, привет» is not personal data of the customer.
 * Маша is the assistant's name since 02.11.2026 (before — Мила; kept so that
 * «Мила, привет» from returning customers is not flagged either).
 * «Маша» is also a common customer name, so detect.ts still flags it next to a
 * surname or a relation word («с дочкой Машей»), and «меня зовут Маша» is caught
 * by the context rule.
 */
export const AGENT_NAMES = new Set([
  'маша', 'маши', 'маше', 'машу', 'машей', 'машею',
  'мила', 'милы', 'миле', 'милу', 'милой', 'милою',
])

/**
 * Words before «Маша» that make it a person, not the assistant: «я Маша», «это Маша»,
 * «мы с Машей», «с дочкой Машей», «жена Маша».
 */
export const RELATION_WORDS = new Set(
  `я это с со и для дочь дочери дочерью дочка дочки дочке дочку дочкой жена жены жене жену женой сестра сестры сестре
   сестру сестрой мама мамы маме маму мамой подруга подруги подруге подругу подругой супруга супруги
   супруге супругу супругой внучка внучки внучке внучку внучкой племянница племянницы племяннице
   племянницу племянницей бабушка бабушки бабушке бабушку бабушкой тетя тети тете тетю тетей коллега
   коллеги коллеге коллегу коллегой`
    .split(/\s+/)
    .filter(Boolean),
)

/** Irregular case forms. */
const SPECIAL_FORMS: Record<string, string[]> = {
  лев: ['льва', 'льву', 'львом', 'льве'],
  павел: ['павла', 'павлу', 'павлом', 'павле'],
  петр: ['петра', 'петру', 'петром', 'петре'],
  любовь: ['любви', 'любовью'],
  марк: ['марка', 'марку', 'марком', 'марке'],
}

const SIBILANT_OR_VELAR = /[гкхжшщч]$/
const SIBILANT = /[жшщчц]$/

/** Lower-case case forms of a first name (nominative included). */
export function nameForms(base: string): string[] {
  const b = base.toLowerCase().replace(/ё/g, 'е')
  const out = new Set<string>([b])
  if (SPECIAL_FORMS[b]) {
    for (const f of SPECIAL_FORMS[b]) out.add(f)
    return [...out]
  }
  if (b.endsWith('ия')) {
    const s = b.slice(0, -1)
    for (const e of ['и', 'ю', 'ей', 'ею']) out.add(s + e)
  } else if (b.endsWith('я')) {
    const s = b.slice(0, -1)
    for (const e of ['и', 'е', 'ю', 'ей', 'ею']) out.add(s + e)
  } else if (b.endsWith('а')) {
    const s = b.slice(0, -1)
    out.add(s + (SIBILANT_OR_VELAR.test(s) ? 'и' : 'ы'))
    for (const e of ['е', 'у', 'ой', 'ою']) out.add(s + e)
    if (SIBILANT.test(s)) out.add(s + 'ей')
  } else if (b.endsWith('ий')) {
    const s = b.slice(0, -1)
    for (const e of ['я', 'ю', 'ем', 'и']) out.add(s + e)
  } else if (b.endsWith('й')) {
    const s = b.slice(0, -1)
    for (const e of ['я', 'ю', 'ем', 'е']) out.add(s + e)
  } else if (b.endsWith('ь')) {
    const s = b.slice(0, -1)
    for (const e of ['я', 'ю', 'ем', 'е', 'и']) out.add(s + e)
  } else if (/[бвгджзклмнпрстфхцчшщ]$/.test(b)) {
    for (const e of ['а', 'у', 'е']) out.add(b + e)
    out.add(b + (SIBILANT.test(b) ? 'ем' : 'ом'))
  }
  // Names ending in и / о / е / у do not decline (Ани, Нелли, Нино, Эмре).
  return [...out]
}

export interface NameEntry {
  base: string
  ambiguous: boolean
}

/** form → entry */
export const NAME_FORMS: Map<string, NameEntry> = (() => {
  const map = new Map<string, NameEntry>()
  const all = `${FEMALE} ${MALE}`.split(/\s+/).filter(Boolean)
  for (const raw of all) {
    const base = raw.replace(/ё/g, 'е')
    const ambiguous = AMBIGUOUS_NAMES.has(base)
    for (const f of nameForms(base)) {
      const prev = map.get(f)
      // A form shared by an ambiguous and a normal name stays ambiguous.
      map.set(f, { base, ambiguous: ambiguous || Boolean(prev?.ambiguous) })
    }
  }
  return map
})()

/** Latin spellings of the same names, as in a passport: SERGEI / SERGEY. */
const TRANSLIT: Record<string, string[]> = {
  а: ['a'], б: ['b'], в: ['v'], г: ['g'], д: ['d'], е: ['e'], ж: ['zh'], з: ['z'], и: ['i'],
  й: ['i', 'y'], к: ['k'], л: ['l'], м: ['m'], н: ['n'], о: ['o'], п: ['p'], р: ['r'], с: ['s'],
  т: ['t'], у: ['u'], ф: ['f'], х: ['kh', 'h'], ц: ['ts'], ч: ['ch'], ш: ['sh'], щ: ['shch', 'sch'],
  ъ: ['ie', ''], ы: ['y'], ь: [''], э: ['e'], ю: ['iu', 'yu'], я: ['ia', 'ya'],
}

function translitVariants(word: string): string[] {
  let acc = ['']
  for (const ch of word) {
    const opts = TRANSLIT[ch] ?? [ch]
    const next: string[] = []
    for (const a of acc) for (const o of opts) next.push(a + o)
    acc = next.slice(0, 16)
  }
  return acc
}

export const LATIN_NAMES: Set<string> = (() => {
  const set = new Set<string>()
  const all = `${FEMALE} ${MALE}`.split(/\s+/).filter(Boolean)
  for (const raw of all) {
    const base = raw.replace(/ё/g, 'е')
    if (AMBIGUOUS_NAMES.has(base) || base.length < 3) continue
    for (const v of translitVariants(base)) set.add(v)
  }
  for (const extra of ['sergey', 'sergei', 'alexey', 'alexei', 'alexander', 'alexandra', 'yulia', 'julia', 'natalia', 'natalya', 'tatiana', 'tatyana', 'olga', 'elena', 'helen', 'maria', 'anna', 'ivan', 'dmitry', 'dmitrii', 'mikhail', 'michael', 'andrey', 'andrei', 'yuri', 'yury']) {
    set.add(extra)
  }
  return set
})()
