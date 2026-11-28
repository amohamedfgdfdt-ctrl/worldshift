// Campaign content: 9 stages. Every objective is checked against real simulation data
// (see Campaign._measure). Texts are in English and Arabic.
import { i18n } from './i18n.js';

/** Items available from the start of the Campaign. Everything else is a reward. */
export const BASE_KIT = { types: ['house_small', 'tree', 'road', 'water_tank'], tools: ['pour', 'source'] };

// n = target value, h = sustain hours (game time), bonus = only counts for the 3rd star.
export const STAGES = [
  {
    id: 's1', seed: 7, difficulty: 1, par: [2, 1.2], stab: 40,
    env: { funds: 4000, food: 0, sourceRate: 1, wind: 0.6, cloud: 0.35, hour: 9 }, needs: [],
    objectives: [
      { id: 'a', type: 'build', key: 'house_small', n: 2 },
      { id: 'b', type: 'roadConnected', n: 2 },
      { id: 'c', type: 'build', key: 'water_tank', n: 1 },
      { id: 'd', type: 'population', n: 8 },
      { id: 'e', type: 'sources', n: 1, bonus: true },
    ],
    rewards: { types: ['farm'], tools: [] },
  },
  {
    id: 's2', seed: 21, difficulty: 1, par: [3, 2], stab: 60,
    env: { funds: 4200, food: 0, sourceRate: 1, wind: 0.6, cloud: 0.4, hour: 8 }, needs: ['water'],
    objectives: [
      { id: 'a', type: 'build', key: 'house_small', n: 6 },
      { id: 'b', type: 'build', key: 'water_tank', n: 2 },
      { id: 'c', type: 'population', n: 24 },
      { id: 'd', type: 'waterStored', n: 1500 },
      { id: 'e', type: 'needs', h: 6, what: ['water'] },
      { id: 'f', type: 'stability', n: 70, h: 6, bonus: true },
      { id: 'g', type: 'trips', n: 15, bonus: true },
    ],
    rewards: { types: ['solar_plant', 'wind_turbine'], tools: [] },
  },
  {
    id: 's3', seed: 42, difficulty: 2, par: [4, 3], stab: 65,
    env: { funds: 5500, food: 150, sourceRate: 0.85, wind: 0.6, cloud: 0.4, hour: 7 }, needs: ['water', 'food'],
    objectives: [
      { id: 'a', type: 'farmsIrrigated', n: 3 },
      { id: 'b', type: 'population', n: 40 },
      { id: 'c', type: 'foodStock', n: 400 },
      { id: 'd', type: 'needs', h: 8, what: ['water', 'food'] },
      { id: 'e', type: 'stability', n: 75, h: 6, bonus: true },
    ],
    rewards: { types: ['factory_small'], tools: [] },
  },
  {
    id: 's4', seed: 99, difficulty: 2, par: [4.5, 3.5], stab: 65,
    env: { funds: 8500, food: 300, sourceRate: 1, wind: 0.9, cloud: 0.6, hour: 10 }, needs: ['water', 'food', 'energy'],
    objectives: [
      { id: 'a', type: 'build', key: 'solar_plant', n: 1 },
      { id: 'b', type: 'build', key: 'wind_turbine', n: 1 },
      { id: 'c', type: 'population', n: 60 },
      { id: 'd', type: 'energyBalance', h: 12 },
      { id: 'e', type: 'needs', h: 8, what: ['water', 'food'] },
      { id: 'f', type: 'stability', n: 75, h: 8, bonus: true },
    ],
    rewards: { types: ['house_medium'], tools: [] },
  },
  {
    id: 's5', seed: 555, difficulty: 3, par: [5, 3.5], stab: 65,
    env: { funds: 7500, food: 400, sourceRate: 1, wind: 0.8, cloud: 0.5, hour: 9 }, needs: ['water', 'food', 'energy'],
    objectives: [
      { id: 'a', type: 'poweredFactories', n: 2 },
      { id: 'b', type: 'population', n: 80 },
      { id: 'c', type: 'jobs', n: 20 },
      { id: 'd', type: 'income', n: 40 },
      { id: 'e', type: 'funds', n: 3000 },
      { id: 'f', type: 'energyBalance', h: 8, bonus: true },
    ],
    rewards: { types: [], tools: ['drain'] },
  },
  {
    id: 's6', seed: 5150, difficulty: 3, par: [6, 4.5], stab: 70,
    env: { funds: 9000, food: 500, sourceRate: 1, wind: 0.8, cloud: 0.5, hour: 9 }, needs: ['water', 'food', 'energy'],
    objectives: [
      { id: 'a', type: 'population', n: 150 },
      { id: 'b', type: 'build', key: 'house_medium', n: 4 },
      { id: 'c', type: 'roadConnected', n: 8 },
      { id: 'd', type: 'stability', n: 75, h: 12 },
      { id: 'e', type: 'needs', h: 12, what: ['water', 'food'] },
      { id: 'f', type: 'energyBalance', h: 8, bonus: true },
      { id: 'g', type: 'trips', n: 40, bonus: true },
    ],
    rewards: { types: [], tools: [] },
  },
  {
    id: 's7', seed: 12, difficulty: 4, par: [9, 7], stab: 60,
    env: { funds: 9000, food: 500, sourceRate: 1.15, wind: 0.8, cloud: 0.6, hour: 9 }, needs: ['water', 'food', 'energy'],
    events: [{ id: 'rain1', type: 'rain', at: 18, dur: 6, warn: 4 }, { id: 'storm1', type: 'storm', at: 40, dur: 5, warn: 5 }],
    objectives: [
      { id: 'a', type: 'population', n: 100 },
      { id: 'b', type: 'build', key: 'water_tank', n: 3 },
      { id: 'c', type: 'survive', ev: 'storm1', n: 2 },
      { id: 'd', type: 'stability', n: 60, h: 6 },
      { id: 'e', type: 'survive', ev: 'rain1', n: 1, bonus: true },
    ],
    rewards: { types: [], tools: [] },
  },
  {
    id: 's8', seed: 13, difficulty: 4, par: [10, 8], stab: 65,
    env: { funds: 10000, food: 600, sourceRate: 0.9, wind: 0.8, cloud: 0.3, hour: 8 }, needs: ['water', 'food', 'energy'],
    events: [{ id: 'dry1', type: 'drought', at: 14, dur: 36, warn: 6 }],
    objectives: [
      { id: 'a', type: 'population', n: 120 },
      { id: 'b', type: 'waterStored', n: 4000 },
      { id: 'c', type: 'needsDuring', ev: 'dry1', what: ['water', 'food'] },
      { id: 'd', type: 'stability', n: 65, h: 8 },
      { id: 'e', type: 'foodStock', n: 900, bonus: true },
    ],
    rewards: { types: [], tools: [] },
  },
  {
    id: 's9', seed: 8080, difficulty: 5, par: [12, 9], stab: 70,
    env: { funds: 12000, food: 600, sourceRate: 1.05, wind: 0.8, cloud: 0.5, hour: 9 }, needs: ['water', 'food', 'energy'],
    events: [{ id: 'rain2', type: 'rain', at: 20, dur: 6, warn: 4 }, { id: 'dry2', type: 'drought', at: 52, dur: 24, warn: 6 }, { id: 'storm2', type: 'storm', at: 90, dur: 5, warn: 6 }],
    objectives: [
      { id: 'a', type: 'population', n: 220 },
      { id: 'b', type: 'poweredFactories', n: 3 },
      { id: 'c', type: 'energyBalance', h: 12 },
      { id: 'd', type: 'survive', ev: 'storm2', n: 3 },
      { id: 'e', type: 'stability', n: 70, h: 12 },
      { id: 'f', type: 'funds', n: 8000, bonus: true },
      { id: 'g', type: 'trips', n: 120 },
    ],
    rewards: { types: [], tools: [] },
  },
];

// ---------------------------------------------------------------- texts
const S = {
  s1: ['First Steps', 'Learn the controls: place houses, lay a road, collect water and watch your first residents move in.',
    ['Pick “Small House” in Buildings, move over flat dry ground and tap ✓ to place it.', 'Roads link your village: choose Road in Infrastructure, tap the start and then the end. The road builds itself along the ground.', 'Water Tanks (Infrastructure) collect water from the ground — place one near the lake or river.', 'A house with no road in front of it fills three times slower. Tap a house and use “Connect to road”.', 'Bonus: in Water Tools choose “Water Source” and place a second spring.']],
  s2: ['The Village', 'Residents need water. Tanks hold what the ground collects, and growth stops when the tanks run dry.',
    ['Put tanks close to the river or lake: the closer to water, the faster they fill.', 'Each resident drinks 1 unit of water per hour; rivers refill tanks slowly, so add Water Sources upstream. Watch the Water bar at the top.', 'Keep houses away from the water line: flooded houses are abandoned.']],
  s3: ['Harvest', 'Food is now needed too. Farms only yield well next to surface water and when powered.',
    ['Select a farm and check its Irrigation: Excellent gives full yield, “None nearby” almost nothing.', 'A farm with good irrigation feeds about 20-30 residents. Food storage grows with every farm.', 'Do not place farms in the flood zone: a flooded farm produces nothing.']],
  s4: ['Power', 'Farms, tanks and houses draw power. Solar works only by day, wind also at night.',
    ['Solar peaks at noon and is zero at night; wind follows the Wind setting in World.', 'Homes use more power at night, factories work by day. Mix both sources and watch the Energy bar: supply versus demand.', 'Low energy lowers farm yield and stability.']],
  s5: ['Industry', 'Factories sell goods for funds, but need workers and power. Balance the budget.',
    ['A factory needs about two thirds of its jobs filled by residents and full power.', 'Funds = taxes + factory output − upkeep. Check the net income in the Funds panel.', 'Build houses before factories so the workers exist.']],
  s6: ['The City', 'Grow a full city: more homes, a road network and steady needs for half a day.',
    ['Medium houses hold 8 residents. They also draw more power.', 'Spread tanks and farms as the city grows: one tank supports about 25 residents.', 'Factories only ship when a road reaches them and their workers can drive in. Watch the income line.', 'Stability drops when any need is short. Fix the shortage fast.']],
  s7: ['Storm Season', 'Heavy rain and a storm will raise the water. Prepare tanks, keep houses off the low ground.',
    ['A warning appears hours before each event. Use it.', 'The Drain tool removes water. Tanks also absorb flood water.', 'Flooded houses lose their residents and cost stability.']],
  s8: ['Dry Spell', 'A long drought cuts the springs to a third. Stock water and food before it starts.',
    ['During the drought tanks refill slowly; the stored water must last.', 'Food stock is your buffer. Build extra farms early.', 'Evaporation lowers the lakes: farms far from water suffer.']],
  s9: ['Metropolis', 'Everything at once: a big industrial city that survives rain, drought and a final storm.',
    ['Plan power first: three factories draw a lot.', 'After the rain, expect the drought: do not spend your water reserve.', 'The final storm decides the third star.']],
};
const SAR = {
  s1: ['الخطوات الأولى', 'تعلّم التحكم: ضع منازل وأنشئ طريقًا واجمع الماء وشاهد أول السكان ينتقلون.',
    ['اختر «منزل صغير» من المباني وضعه على أرض مستوية جافة ثم اضغط ✓.', 'الطرق تربط قريتك: اختر «طريق» من البنية التحتية، اضغط نقطة البداية ثم نقطة النهاية. الطريق يتبنى لوحده على الأرض.', 'خزانات المياه تجمع الماء من الأرض — ضع واحدًا قرب البحيرة أو النهر.', 'البيت اللي مفيش قدامه طريق يملي أبطأ بثلاث مرات. اختر البيت واضغط «وصّله بطريق».', 'إضافي: من أدوات المياه اختر «مصدر ماء» وضع نبعًا ثانيًا.']],
  s2: ['القرية', 'يحتاج السكان إلى الماء. تحفظ الخزانات ما تجمعه الأرض، وتتوقف الزيادة السكانية إذا جفّت.',
    ['ضع الخزانات قرب النهر أو البحيرة: كلما اقتربت من الماء امتلأت أسرع.', 'يشرب كل ساكن وحدة ماء في الساعة؛ والنهر يملأ الخزانات ببطء لذا أضف مصادر ماء عند المنبع. راقب شريط المياه في الأعلى.', 'ابعد المنازل عن خط الماء: المنازل الغارقة تُهجر.']],
  s3: ['الحصاد', 'صار الغذاء مطلوبًا أيضًا. لا تعطي المزارع محصولًا جيدًا إلا قرب المياه السطحية وعند توفر الطاقة.',
    ['اختر مزرعة وانظر إلى الري: «ممتاز» يعطي المحصول كاملًا، و«لا يوجد» يعطي القليل.', 'تُطعم المزرعة المروية جيدًا نحو 20 إلى 30 ساكنًا. وتزداد سعة التخزين مع كل مزرعة.', 'لا تضع المزارع في منطقة الفيضان: المزرعة الغارقة لا تنتج.']],
  s4: ['الطاقة', 'المزارع والخزانات والمنازل تستهلك الطاقة. الشمس تعمل نهارًا فقط والرياح تعمل ليلًا أيضًا.',
    ['الطاقة الشمسية في ذروتها ظهرًا وتنعدم ليلًا؛ الرياح تتبع إعداد الرياح في العالم.', 'المنازل تستهلك أكثر ليلًا والمصانع تعمل نهارًا. اجمع المصدرين وراقب شريط الطاقة: الإنتاج مقابل الطلب.', 'نقص الطاقة يخفض إنتاج المزارع والاستقرار.']],
  s5: ['الصناعة', 'تبيع المصانع منتجاتها مقابل المال لكنها تحتاج عمالًا وطاقة. وازن الميزانية.',
    ['يحتاج المصنع نحو ثلثي وظائفه مشغولة من السكان وطاقة كاملة.', 'الأموال = الضرائب + إنتاج المصانع − الصيانة. راقب صافي الدخل.', 'ابنِ المنازل قبل المصانع ليوجد العمال.']],
  s6: ['المدينة', 'ابنِ مدينة كاملة: منازل أكثر وشبكة طرق واحتياجات مستقرة لنصف يوم.',
    ['المنازل المتوسطة تتسع لـ 8 سكان وتستهلك طاقة أكثر.', 'وزّع الخزانات والمزارع مع نمو المدينة: خزان واحد يخدم نحو 25 ساكنًا.', 'المصنع لا يبيع إلا لو وصله طريق ويقدر العمال يوصلوا له. راقب سطر الدخل.', 'ينخفض الاستقرار عند نقص أي احتياج. عالج النقص بسرعة.']],
  s7: ['موسم العواصف', 'ستُرفع الأمطار الغزيرة والعاصفة منسوب المياه. جهّز الخزانات وابعد المنازل عن الأراضي المنخفضة.',
    ['يظهر تحذير قبل كل حدث بساعات. استفد منه.', 'أداة التصريف تزيل الماء، والخزانات تمتص جزءًا من مياه الفيضان.', 'المنازل الغارقة تفقد سكانها وتخفض الاستقرار.']],
  s8: ['موسم الجفاف', 'جفاف طويل يخفض الينابيع إلى الثلث. خزّن الماء والغذاء قبل أن يبدأ.',
    ['أثناء الجفاف تمتلئ الخزانات ببطء؛ يجب أن يكفي المخزون.', 'مخزون الغذاء هو احتياطك. ابنِ مزارع إضافية مبكرًا.', 'التبخر يخفض البحيرات: المزارع البعيدة عن الماء تتضرر.']],
  s9: ['المدينة الكبرى', 'كل شيء معًا: مدينة صناعية كبيرة تتجاوز المطر والجفاف والعاصفة الأخيرة.',
    ['خطّط للطاقة أولًا: ثلاثة مصانع تستهلك الكثير.', 'بعد المطر توقّع الجفاف: لا تُنفق احتياطي الماء.', 'العاصفة الأخيرة تحسم النجمة الثالثة.']],
};
const DIFF = { en: ['', 'Easy', 'Gentle', 'Medium', 'Hard', 'Expert'], ar: ['', 'سهل', 'لطيف', 'متوسط', 'صعب', 'خبير'] };
const ENV = {
  en: { s1: 'Calm meadow, clear sky', s2: 'River valley, normal springs', s3: 'Drier valley, weaker springs', s4: 'Windy ridge, cloudy', s5: 'Open plain, balanced', s6: 'Wide basin, balanced', s7: 'River-rich lowland, stormy', s8: 'Dry highland, strong sun', s9: 'Large basin, all hazards' },
  ar: { s1: 'مرج هادئ وسماء صافية', s2: 'وادي نهري وينابيع عادية', s3: 'وادٍ أجفّ وينابيع أضعف', s4: 'سلسلة رياح وغيوم', s5: 'سهل مفتوح ومتوازن', s6: 'حوض واسع ومتوازن', s7: 'أراضٍ منخفضة غنية بالأنهار وعواصف', s8: 'مرتفعات جافة وشمس قوية', s9: 'حوض كبير وكل المخاطر' },
};
for (const [lang, src] of [['en', S], ['ar', SAR]]) {
  const d = {};
  for (const [id, [name, desc, hints]] of Object.entries(src)) {
    d[`st.${id}.name`] = name; d[`st.${id}.desc`] = desc;
    hints.forEach((h, i) => { d[`st.${id}.h${i}`] = h; });
    d[`st.${id}.env`] = ENV[lang][id];
  }
  DIFF[lang].forEach((x, i) => { if (i) d[`diff.${i}`] = x; });
  d['res.fail.flood'] = lang === 'ar' ? 'أغرق الفيضان منازل أكثر مما يحتمله الهدف.' : 'The flood hit more houses than the objective allowed.';
  d['obj.needsDuring'] = lang === 'ar' ? 'أبقِ الماء والغذاء كافيين طوال {ev}' : 'Keep water and food satisfied through the {ev}';
  d['obj.sources'] = lang === 'ar' ? 'ضع {n} مصدر ماء جديد' : 'Place {n} new water source';
  d['reward.farm'] = d['b.farm'] ?? '';
  d['br.tip'] = lang === 'ar'
    ? 'نصيحة: ابنِ بالتدريج. كل مبنى بيتحاسب عليه صيانة كل ساعة، والسكان بيملوا البيوت ببطء. لو صرفت كل الرصيد في أول ساعة هتفلس. ابدأ بالمية والغذاء وبيت أو اتنين، واستنى الصافي يبقى موجب.'
    : 'Tip: build gradually. Every building bills upkeep each hour, and residents fill houses slowly. Spend everything in the first hour and you go broke. Start with water, food and a house or two, then wait for the net to turn positive.';
  i18n.add(lang, d);
}

// ---------------------------------------------------------------- pre-stage briefing
// A short screen before every stage: what keeps stability up, how to raise food, and
// how roads/vehicles behave at this point in the campaign. Tailored per stage.
const BRIEF = {
  en: {
    s1: {
      stab: ['Stability is the average of water, food, energy and dry ground. Here only water is checked, so a tank is enough.',
        'Each resident drinks 1 water per hour. A tank next to the river or lake fills faster than one on dry ground.'],
      food: ['Food is not required yet. From stage 3 residents eat, and a farm only yields fully next to surface water.'],
      road: ['A house with no road in front of it fills three times slower. Connect every house to the road.',
        'A road builds itself between the two points you tap. Cars appear as the population grows.'],
    },
    s2: {
      stab: ['Keep the Water bar high: when it drops under half, houses stop growing; under a tenth residents leave.',
        'Do not place houses on the water line. A flooded house is abandoned and drags stability down.'],
      food: ['Food starts to matter in the next stage. Stock the habit now: tanks near water, houses on dry ground.'],
      road: ['Houses on the road network fill three times faster, and the road is what brings the cars that count as trips.'],
    },
    s3: {
      stab: ['Water and food are both checked now: keep both bars above half and stability climbs.',
        'Stability under 30 stops growth entirely, so fix the shortage before building more houses.'],
      food: ['A farm next to surface water shows Excellent irrigation and feeds 20-30 residents. Far from water it gives almost nothing.',
        'Every farm adds 500 to food storage. Food is eaten at 2 per resident per hour, so grow farms as the population grows.',
        'Never place a farm in the flood zone: a flooded farm produces nothing.',
        'Place farms close to water for better irrigation, but never in the water itself. If the info panel says Flooding, the farm tile itself is underwater: move it to dry ground, because a flooded farm gives no food.'],
      road: ['Farms produce more when a road reaches them.'],
    },
    s4: {
      stab: ['Energy now counts: supply against demand. Solar is zero at night, wind keeps working.',
        'Low energy lowers farm yield and stability at the same time.'],
      food: ['Power is food here: a farm with full energy yields 100%, with no energy about 60%.',
        'Place farms close to water for better irrigation, but never in the water itself. If the info panel says Flooding, the farm tile itself is underwater: move it to dry ground, because a flooded farm gives no food.'],
      road: [],
    },
    s5: {
      stab: ['Factories need workers and full power, or they stop shipping and income drops.',
        'Keep the net line in the Funds panel positive: taxes plus factory output minus upkeep.'],
      food: ['Industry grows the city, and every new resident eats 2 food per hour. Add a farm before the Food bar dips.',
        'Place farms close to water for better irrigation, but never in the water itself. If the info panel says Flooding, the farm tile itself is underwater: move it to dry ground, because a flooded farm gives no food.'],
      road: ['A factory only ships when a road reaches it and its workers can drive in from a connected home.',
        'Watch the Jobs line: jobs beyond what connected homes can fill are wasted money.'],
    },
    s6: {
      stab: ['Stability must hold for half a day, so build a margin: extra tank, extra farm, extra power.',
        'One tank supports about 25 residents. Spread tanks and farms as the city grows instead of one big cluster.'],
      food: ['Medium houses hold 8 residents each, so food demand climbs fast. Two farms per ten medium houses is a safe start.',
        'Place farms close to water for better irrigation, but never in the water itself. If the info panel says Flooding, the farm tile itself is underwater: move it to dry ground, because a flooded farm gives no food.'],
      road: ['Eight buildings must be on the road network, and factories only ship over roads.',
        'Cars come from population, farms and factories. More connected buildings means more trips.'],
    },
    s7: {
      stab: ['Rain and a storm raise the water. Keep houses off the low ground and keep a spare tank.',
        'A flooded house loses its residents and costs stability. The Drain tool removes water.'],
      food: ['Farms in the flood zone stop producing during the storm. Place them on higher ground.',
        'Place farms close to water for better irrigation, but never in the water itself. If the info panel says Flooding, the farm tile itself is underwater: move it to dry ground, because a flooded farm gives no food.'],
      road: ['A road that spans water becomes a bridge and keeps working during the flood: it is the safe link.'],
    },
    s8: {
      stab: ['A long drought cuts the springs to a third. The water you stored before it starts is what keeps stability up.',
        'During the drought tanks refill slowly: do not spend the reserve on new houses.'],
      food: ['Food stock is the buffer: fill it before the drought, because farms near the shrinking lake yield less.',
        'Place farms close to water for better irrigation, but never in the water itself. If the info panel says Flooding, the farm tile itself is underwater: move it to dry ground, because a flooded farm gives no food.'],
      road: [],
    },
    s9: {
      stab: ['Plan power first: three factories draw a lot, and a short supply drops stability and factory output together.',
        'After the rain comes the drought: keep the water reserve for it, and keep houses off the low ground.'],
      food: ['220 residents eat about 440 food per hour. Build the farms early, near water and with full power.',
        'Place farms close to water for better irrigation, but never in the water itself. If the info panel says Flooding, the farm tile itself is underwater: move it to dry ground, because a flooded farm gives no food.'],
      road: ['120 car trips: cars come from population, connected farms and factories, so connect everything and keep the roads continuous.',
        'A broken road network strands the cars: check that every building shows road access.'],
    },
  },
  ar: {
    s1: {
      stab: ['الاستقرار هو متوسط الماء والغذاء والطاقة والأرض الجافة. هنا الماء بس هو المطلوب، فخزان واحد يكفي.',
        'كل ساكن بيشرب وحدة ماء في الساعة. الخزان اللي جنب النهر أو البحيرة بيمتلي أسرع من اللي على أرض جافة.'],
      food: ['الغذاء مش مطلوب لسه. من المرحلة الثالثة السكان بيأكلوا، والمزرعة بتدي محصول كامل بس لو جنب ماء سطحي.'],
      road: ['البيت اللي مفيش قدامه طريق بيمتلي أبطأ ثلاث مرات. وصّل كل بيت بالطريق.',
        'الطريق بيتبنى لوحده بين النقطتين اللي بتضغط عليهم. والعربيات بتظهر لما عدد السكان يزيد.'],
    },
    s2: {
      stab: ['خلّي شريط الماء عالي: لو نزل تحت النص المنازل بتوقف عن النمو، وتحت العُشر السكان بيسيبوا.',
        'متحطش منازل على خط الماء. البيت الغرقان بيتساب وبيقلل الاستقرار.'],
      food: ['الغذاء بيبدأ يهم من المرحلة الجاية. جهّز العادة من دلوقتي: خزانات قرب الماء ومنازل على أرض جافة.'],
      road: ['البيوت اللي على شبكة الطرق بتمتلي أسرع بثلاث مرات، والطريق هو اللي بيجيب العربيات اللي بتتحسب رحلات.'],
    },
    s3: {
      stab: ['الماء والغذاء الاتنين مطلوبين دلوقتي: خلّي الشريطين فوق النص والاستقرار بيطلع.',
        'استقرار تحت 30 بيوقف النمو خالص، فصلّح النقص قبل ما تبني منازل جديدة.'],
      food: ['المزرعة جنب الماء السطحي بتوريك ري «ممتاز» وبتأكل 20-30 ساكن. البعيدة عن الماء مش بتدي حاجة تقريبًا.',
        'كل مزرعة بتزود مخزن الغذاء 500. الأكل بيستهلك 2 لكل ساكن في الساعة، فزوّد مزارع مع زيادة السكان.',
        'متحطش مزرعة في منطقة الفيضان: المزرعة الغرقانة مش بتنتج.',
        'حط المزارع قريبة من الماء عشان الري يبقى أحسن، بس مش جوه الماء نفسه. لو لوحة المعلومات قالت Flooding يبقى مكان المزرعة نفسه تحت الماء: انقلها لأرض جافة، لأن المزرعة الغرقانة مبتنتجش غذاء.'],
      road: ['المزرعة اللي بيوصلها طريق بتنتج أكتر.'],
    },
    s4: {
      stab: ['الطاقة بقت محسوبة: الإنتاج مقابل الطلب. الشمس صفر بالليل، والرياح شغالة.',
        'نقص الطاقة بيقلل محصول المزارع والاستقرار في نفس الوقت.'],
      food: ['الطاقة هنا بتتحول غذاء: مزرعة بطاقة كاملة بتدي 100%، ومن غير طاقة حوالي 60%.',
        'حط المزارع قريبة من الماء عشان الري يبقى أحسن، بس مش جوه الماء نفسه. لو لوحة المعلومات قالت Flooding يبقى مكان المزرعة نفسه تحت الماء: انقلها لأرض جافة، لأن المزرعة الغرقانة مبتنتجش غذاء.'],
      road: [],
    },
    s5: {
      stab: ['المصنع محتاج عمال وطاقة كاملة، وإلا بيوقف الشحن والدخل بيقل.',
        'خلّي صافي الدخل في لوحة الأموال موجب: ضرائب + إنتاج المصانع − الصيانة.'],
      food: ['الصناعة بتكبّر المدينة، وكل ساكن جديد بياكل 2 غذاء في الساعة. ضيف مزرعة قبل ما شريط الغذاء ينزل.',
        'حط المزارع قريبة من الماء عشان الري يبقى أحسن، بس مش جوه الماء نفسه. لو لوحة المعلومات قالت Flooding يبقى مكان المزرعة نفسه تحت الماء: انقلها لأرض جافة، لأن المزرعة الغرقانة مبتنتجش غذاء.'],
      road: ['المصنع بيبيع بس لما طريق يوصله والعمال يقدروا يوصلوا له من بيت موصول.',
        'راقب سطر الوظائف: وظائف أكتر من اللي بيوتك الموصولة تقدر تشغلها = فلوس ضايعة.'],
    },
    s6: {
      stab: ['الاستقرار لازم يثبت نص يوم، فابنِ بهامش: خزان زيادة، مزرعة زيادة، طاقة زيادة.',
        'الخزان الواحد يخدم حوالي 25 ساكن. وزّع الخزانات والمزارع مع نمو المدينة بدل ما تحطهم كلهم في مكان واحد.'],
      food: ['المنزل المتوسط بياخد 8 سكان، فطلب الغذاء بيزيد بسرعة. مزرعتين لكل عشرة منازل متوسطة بداية آمنة.',
        'حط المزارع قريبة من الماء عشان الري يبقى أحسن، بس مش جوه الماء نفسه. لو لوحة المعلومات قالت Flooding يبقى مكان المزرعة نفسه تحت الماء: انقلها لأرض جافة، لأن المزرعة الغرقانة مبتنتجش غذاء.'],
      road: ['محتاج 8 مباني على شبكة الطرق، والمصانع بتبيع بس على الطرق.',
        'العربيات بتيجي من السكان والمزارع والمصانع. مباني موصولة أكتر = رحلات أكتر.'],
    },
    s7: {
      stab: ['المطر والعاصفة بيرفعوا المنسوب. ابعد المنازل عن الأرض المنخفضة وخلّي خزان احتياطي.',
        'البيت الغرقان بيفقد سكانه وبيقلل الاستقرار. أداة التصريف بتشيل الماء.'],
      food: ['المزارع اللي في منطقة الفيضان بتوقف إنتاج أثناء العاصفة. حطها على أرض أعلى.',
        'حط المزارع قريبة من الماء عشان الري يبقى أحسن، بس مش جوه الماء نفسه. لو لوحة المعلومات قالت Flooding يبقى مكان المزرعة نفسه تحت الماء: انقلها لأرض جافة، لأن المزرعة الغرقانة مبتنتجش غذاء.'],
      road: ['الطريق اللي بيقطع الماء بيبقى كوبري وبيفضل شغال وقت الفيضان: ده الوصلة الآمنة.'],
    },
    s8: {
      stab: ['الجفاف الطويل بيقلل الينابيع للتلت. الماء اللي خزّنته قبل ما يبدأ هو اللي بيحافظ على الاستقرار.',
        'أثناء الجفاف الخزانات بتمتلي ببطء: متصرفش الاحتياطي على منازل جديدة.'],
      food: ['مخزون الغذاء هو الاحتياطي: امتلاه قبل الجفاف، لأن المزارع جنب البحيرة اللي بتقل بتنتج أقل.',
        'حط المزارع قريبة من الماء عشان الري يبقى أحسن، بس مش جوه الماء نفسه. لو لوحة المعلومات قالت Flooding يبقى مكان المزرعة نفسه تحت الماء: انقلها لأرض جافة، لأن المزرعة الغرقانة مبتنتجش غذاء.'],
      road: [],
    },
    s9: {
      stab: ['خطّط للطاقة الأول: تلات مصانع بتسحب كتير، ونقص الإنتاج بيقلل الاستقرار وإنتاج المصانع مع بعض.',
        'بعد المطر بييجي الجفاف: خلّي احتياطي الماء له، وابعد المنازل عن الأرض المنخفضة.'],
      food: ['220 ساكن بياكلوا حوالي 440 غذاء في الساعة. ابنِ المزارع بدري، قرب الماء وبطاقة كاملة.',
        'حط المزارع قريبة من الماء عشان الري يبقى أحسن، بس مش جوه الماء نفسه. لو لوحة المعلومات قالت Flooding يبقى مكان المزرعة نفسه تحت الماء: انقلها لأرض جافة، لأن المزرعة الغرقانة مبتنتجش غذاء.'],
      road: ['120 رحلة بالعربية: العربيات بتيجي من السكان والمزارع والمصانع الموصولة، فوصل كل حاجة وخلّي الطرق متصلة.',
        'شبكة طرق مقطوعة بتحبس العربيات: اتأكد إن كل مبنى بيبان له وصول بالطريق.'],
    },
  },
};

for (const [lang, src] of [['en', BRIEF.en], ['ar', BRIEF.ar]]) {
  const d = {};
  for (const [id, b] of Object.entries(src)) {
    for (const sec of ['stab', 'food', 'road']) (b[sec] || []).forEach((x, i) => { d[`br.${id}.${sec}.${i}`] = x; });
  }
  d['br.stab'] = lang === 'ar' ? 'إزاي تحافظ على الاستقرار' : 'How to keep stability';
  d['br.food'] = lang === 'ar' ? 'إزاي تزوّد الغذاء' : 'How to increase food';
  d['br.road'] = lang === 'ar' ? 'الطرق والعربيات' : 'Roads and vehicles';
  d['br.goals'] = lang === 'ar' ? 'أهداف المرحلة' : "This stage's goals";
  d['br.start'] = lang === 'ar' ? 'يلا نبدأ' : 'Start';
  d['br.back'] = lang === 'ar' ? 'رجوع' : 'Back';
  d['br.math'] = lang === 'ar'
    ? 'هدف السكان {n} — المنزل الصغير 4 سكان والمتوسط 8، يعني حوالي {h} منزل.'
    : 'Population goal {n} — a small house holds 4, a medium 8, so about {h} houses.';
  i18n.add(lang, d);
}
