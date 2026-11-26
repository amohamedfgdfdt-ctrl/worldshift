// Campaign content: 9 stages. Every objective is checked against real simulation data
// (see Campaign._measure). Texts are in English and Arabic.
import { i18n } from './i18n.js';

/** Items available from the start of the Campaign. Everything else is a reward. */
export const BASE_KIT = { types: ['house_small', 'tree', 'road', 'water_tank'], tools: ['pour', 'source'] };

// n = target value, h = sustain hours (game time), bonus = only counts for the 3rd star.
export const STAGES = [
  {
    id: 's1', seed: 7, difficulty: 1, par: [2, 1.2], stab: 40,
    env: { funds: 3000, food: 0, sourceRate: 1, wind: 0.6, cloud: 0.35, hour: 9 }, needs: [],
    objectives: [
      { id: 'a', type: 'build', key: 'house_small', n: 2 },
      { id: 'b', type: 'roads', n: 5 },
      { id: 'c', type: 'build', key: 'water_tank', n: 1 },
      { id: 'd', type: 'population', n: 8 },
      { id: 'e', type: 'sources', n: 1, bonus: true },
    ],
    rewards: { types: ['farm'], tools: [] },
  },
  {
    id: 's2', seed: 21, difficulty: 1, par: [3, 2], stab: 60,
    env: { funds: 3200, food: 0, sourceRate: 1, wind: 0.6, cloud: 0.4, hour: 8 }, needs: ['water'],
    objectives: [
      { id: 'a', type: 'build', key: 'house_small', n: 6 },
      { id: 'b', type: 'build', key: 'water_tank', n: 2 },
      { id: 'c', type: 'population', n: 24 },
      { id: 'd', type: 'waterStored', n: 1500 },
      { id: 'e', type: 'needs', h: 6, what: ['water'] },
      { id: 'f', type: 'stability', n: 70, h: 6, bonus: true },
    ],
    rewards: { types: ['solar_plant', 'wind_turbine'], tools: [] },
  },
  {
    id: 's3', seed: 42, difficulty: 2, par: [4, 3], stab: 65,
    env: { funds: 4300, food: 150, sourceRate: 0.85, wind: 0.6, cloud: 0.4, hour: 7 }, needs: ['water', 'food'],
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
      { id: 'c', type: 'roads', n: 25 },
      { id: 'd', type: 'stability', n: 75, h: 12 },
      { id: 'e', type: 'needs', h: 12, what: ['water', 'food'] },
      { id: 'f', type: 'energyBalance', h: 8, bonus: true },
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
    env: { funds: 8000, food: 600, sourceRate: 0.9, wind: 0.8, cloud: 0.3, hour: 8 }, needs: ['water', 'food', 'energy'],
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
    ],
    rewards: { types: [], tools: [] },
  },
];

// ---------------------------------------------------------------- texts
const S = {
  s1: ['First Steps', 'Learn the controls: place houses, lay a road, collect water and watch your first residents move in.',
    ['Pick “Small House” in Buildings, move over flat dry ground and tap ✓ to place it.', 'Roads link your village: choose Road in Infrastructure, tap two points.', 'Water Tanks (Infrastructure) collect water from the ground — place one near the lake or river.', 'Residents move in once their houses are ready. Pan with right-drag, zoom with the wheel.', 'Bonus: in Water Tools choose “Water Source” and place a second spring.']],
  s2: ['The Village', 'Residents need water. Tanks hold what the ground collects, and growth stops when the tanks run dry.',
    ['Put tanks close to the river or lake: the closer to water, the faster they fill.', 'Each resident drinks 1 unit of water per hour; rivers refill tanks slowly, so add Water Sources upstream. Watch the Water bar at the top.', 'Keep houses away from the water line: flooded houses are abandoned.']],
  s3: ['Harvest', 'Food is now needed too. Farms only yield well next to surface water and when powered.',
    ['Select a farm and check its Irrigation: Excellent gives full yield, “None nearby” almost nothing.', 'A farm with good irrigation feeds about 20-30 residents. Food storage grows with every farm.', 'Do not place farms in the flood zone: a flooded farm produces nothing.']],
  s4: ['Power', 'Farms, tanks and houses draw power. Solar works only by day, wind also at night.',
    ['Solar peaks at noon and is zero at night; wind follows the Wind setting in World.', 'Homes use more power at night, factories work by day. Mix both sources and watch the Energy bar: supply versus demand.', 'Low energy lowers farm yield and stability.']],
  s5: ['Industry', 'Factories sell goods for funds, but need workers and power. Balance the budget.',
    ['A factory needs about two thirds of its jobs filled by residents and full power.', 'Funds = taxes + factory output − upkeep. Check the net income in the Funds panel.', 'Build houses before factories so the workers exist.']],
  s6: ['The City', 'Grow a full city: more homes, a road network and steady needs for half a day.',
    ['Medium houses hold 8 residents. They also draw more power.', 'Spread tanks and farms as the city grows: one tank supports about 25 residents.', 'Stability drops when any need is short. Fix the shortage fast.']],
  s7: ['Storm Season', 'Heavy rain and a storm will raise the water. Prepare tanks, keep houses off the low ground.',
    ['A warning appears hours before each event. Use it.', 'The Drain tool removes water. Tanks also absorb flood water.', 'Flooded houses lose their residents and cost stability.']],
  s8: ['Dry Spell', 'A long drought cuts the springs to a third. Stock water and food before it starts.',
    ['During the drought tanks refill slowly; the stored water must last.', 'Food stock is your buffer. Build extra farms early.', 'Evaporation lowers the lakes: farms far from water suffer.']],
  s9: ['Metropolis', 'Everything at once: a big industrial city that survives rain, drought and a final storm.',
    ['Plan power first: three factories draw a lot.', 'After the rain, expect the drought: do not spend your water reserve.', 'The final storm decides the third star.']],
};
const SAR = {
  s1: ['الخطوات الأولى', 'تعلّم التحكم: ضع منازل وأنشئ طريقًا واجمع الماء وشاهد أول السكان ينتقلون.',
    ['اختر «منزل صغير» من المباني وضعه على أرض مستوية جافة ثم اضغط ✓.', 'الطرق تربط قريتك: اختر «طريق» من البنية التحتية وانقر نقطتين.', 'خزانات المياه تجمع الماء من الأرض — ضع واحدًا قرب البحيرة أو النهر.', 'ينتقل السكان عندما تكون المنازل جاهزة. حرّك الكاميرا بالسحب بالزر الأيمن وقرّب بالعجلة.', 'إضافي: من أدوات المياه اختر «مصدر ماء» وضع نبعًا ثانيًا.']],
  s2: ['القرية', 'يحتاج السكان إلى الماء. تحفظ الخزانات ما تجمعه الأرض، وتتوقف الزيادة السكانية إذا جفّت.',
    ['ضع الخزانات قرب النهر أو البحيرة: كلما اقتربت من الماء امتلأت أسرع.', 'يشرب كل ساكن وحدة ماء في الساعة؛ والنهر يملأ الخزانات ببطء لذا أضف مصادر ماء عند المنبع. راقب شريط المياه في الأعلى.', 'ابعد المنازل عن خط الماء: المنازل الغارقة تُهجر.']],
  s3: ['الحصاد', 'صار الغذاء مطلوبًا أيضًا. لا تعطي المزارع محصولًا جيدًا إلا قرب المياه السطحية وعند توفر الطاقة.',
    ['اختر مزرعة وانظر إلى الري: «ممتاز» يعطي المحصول كاملًا، و«لا يوجد» يعطي القليل.', 'تُطعم المزرعة المروية جيدًا نحو 20 إلى 30 ساكنًا. وتزداد سعة التخزين مع كل مزرعة.', 'لا تضع المزارع في منطقة الفيضان: المزرعة الغارقة لا تنتج.']],
  s4: ['الطاقة', 'المزارع والخزانات والمنازل تستهلك الطاقة. الشمس تعمل نهارًا فقط والرياح تعمل ليلًا أيضًا.',
    ['الطاقة الشمسية في ذروتها ظهرًا وتنعدم ليلًا؛ الرياح تتبع إعداد الرياح في العالم.', 'المنازل تستهلك أكثر ليلًا والمصانع تعمل نهارًا. اجمع المصدرين وراقب شريط الطاقة: الإنتاج مقابل الطلب.', 'نقص الطاقة يخفض إنتاج المزارع والاستقرار.']],
  s5: ['الصناعة', 'تبيع المصانع منتجاتها مقابل المال لكنها تحتاج عمالًا وطاقة. وازن الميزانية.',
    ['يحتاج المصنع نحو ثلثي وظائفه مشغولة من السكان وطاقة كاملة.', 'الأموال = الضرائب + إنتاج المصانع − الصيانة. راقب صافي الدخل.', 'ابنِ المنازل قبل المصانع ليوجد العمال.']],
  s6: ['المدينة', 'ابنِ مدينة كاملة: منازل أكثر وشبكة طرق واحتياجات مستقرة لنصف يوم.',
    ['المنازل المتوسطة تتسع لـ 8 سكان وتستهلك طاقة أكثر.', 'وزّع الخزانات والمزارع مع نمو المدينة: خزان واحد يخدم نحو 25 ساكنًا.', 'ينخفض الاستقرار عند نقص أي احتياج. عالج النقص بسرعة.']],
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
  i18n.add(lang, d);
}
