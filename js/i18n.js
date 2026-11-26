// Tiny i18n layer: English + Arabic (RTL). Covers the Campaign UI, the economy HUD,
// building / category names and the mode screen. Older dialogs of the base UI that are
// not listed here stay in English (documented in README). `t(key, vars)` falls back to English.
import { Emitter } from './utils.js';

const LS = 'worldshift.terra.lang';

const en = {
  'lang.name': 'English', 'lang.toggle': 'العربية',
  'mode.title': 'Choose how to play', 'mode.sub': 'You can switch at any time with the mode button in the top bar.',
  'mode.campaign': 'Campaign', 'mode.campaign.d': 'Guided stages with goals, stars and rewards. Your sandbox world is not touched.',
  'mode.sandbox': 'Sandbox', 'mode.sandbox.d': 'Free building with every tool and no limits.',
  'mode.continue': 'Continue', 'mode.start': 'Start', 'mode.back': 'Back',
  'mode.switch': 'Game mode…', 'mode.current': 'Mode',
  'cat.buildings': 'Buildings', 'cat.nature': 'Nature', 'cat.infrastructure': 'Infrastructure', 'cat.water': 'Water Tools', 'cat.world': 'World Settings',
  'b.house_small': 'Small House', 'b.house_medium': 'Medium House', 'b.factory_small': 'Small Factory', 'b.tree': 'Tree', 'b.farm': 'Farm',
  'b.water_tank': 'Water Tank', 'b.road': 'Road', 'b.solar_plant': 'Solar Plant', 'b.wind_turbine': 'Wind Turbine',
  'bd.house_small': 'A cosy home for a small family.', 'bd.house_medium': 'Two floors, room for a larger family.',
  'bd.factory_small': 'Light industry. Employs residents and sells goods when powered.', 'bd.tree': 'Plant a tree. It sways in the wind.',
  'bd.farm': 'Produces food. Yield depends on nearby surface water and power.', 'bd.water_tank': 'Collects water from the surrounding ground. Residents drink from the tanks.',
  'bd.road': 'Click to start, click again to draw a straight road. Esc ends the chain.', 'bd.solar_plant': 'Output follows the sun and is zero at night.',
  'bd.wind_turbine': 'Steady output that grows with the wind. Works at night.',
  'hud.water': 'Water', 'hud.food': 'Food', 'hud.energy': 'Energy', 'hud.funds': 'Funds', 'hud.stability': 'Stability', 'hud.pop': 'Population',
  'hud.perh': '/h', 'hud.title': 'City status', 'hud.demand': 'demand', 'hud.supply': 'supply',
  'cost': 'Cost', 'locked': 'Locked', 'locked.until': 'Unlocked by completing: {stage}', 'cost.no': 'Not enough funds ({cost}).',
  'cost.locked': 'Not unlocked yet.', 'unit.res': 'residents', 'unit.jobs': 'jobs',
  'camp.stages': 'Campaign', 'camp.stars': 'Stars', 'camp.locked': 'Locked', 'camp.open': 'Available', 'camp.done': 'Completed',
  'camp.difficulty': 'Difficulty', 'camp.play': 'Play', 'camp.replay': 'Replay', 'camp.continue': 'Continue', 'camp.restart': 'Restart stage',
  'camp.objectives': 'Objectives', 'camp.bonus': 'Bonus', 'camp.progress': 'Progress', 'camp.unlocks': 'Rewards', 'camp.env': 'Environment',
  'camp.starsrule': '★ complete · ★★ within {p2} days · ★★★ within {p3} days with stability ≥ {st}%',
  'camp.menu': 'Stages', 'camp.exit': 'Exit to menu', 'camp.hint': 'Hint', 'camp.day': 'Day', 'camp.of': 'of',
  'camp.events': 'Events', 'camp.event.soon': '{ev} expected in about {h} h', 'camp.event.start': '{ev} has begun!', 'camp.event.end': '{ev} is over.',
  'ev.rain': 'Heavy rain', 'ev.storm': 'Storm', 'ev.drought': 'Drought',
  'res.title.win': 'Stage complete', 'res.title.fail': 'Stage failed', 'res.stars': 'Stars earned', 'res.time': 'Time', 'res.days': 'days',
  'res.stability': 'Final stability', 'res.min': 'Lowest stability', 'res.pop': 'Population', 'res.funds': 'Funds', 'res.best': 'Best',
  'res.retry': 'Try again', 'res.next': 'Next stage', 'res.menu': 'Stage list', 'res.sandbox': 'Keep playing', 'res.new': 'New rewards',
  'res.fail.pop': 'The population left the settlement.', 'res.fail.stab': 'The settlement collapsed (stability stayed near zero).',
  'res.fail.time': 'Time ran out for this stage.', 'res.allclear': 'You finished the campaign!',
  'conf.exit': 'Leave this stage? Progress in the stage is kept and you can continue later.', 'conf.restart': 'Restart this stage from the beginning?',
  'ok': 'OK', 'cancel': 'Cancel', 'yes': 'Yes',
  'obj.build': 'Build {n} × {name}', 'obj.buildAny': 'Build {n} buildings', 'obj.roads': 'Build {n} road tiles', 'obj.population': 'Reach {n} residents',
  'obj.waterStored': 'Store {n} water in tanks', 'obj.foodStock': 'Stock {n} food', 'obj.farmsIrrigated': '{n} irrigated farms (surface water nearby)',
  'obj.energySupply': 'Produce {n} energy', 'obj.energyBalance': 'Keep energy supply ≥ demand for {h} h', 'obj.needs': 'Keep water and food satisfied for {h} h',
  'obj.stability': 'Keep stability ≥ {n}% for {h} h', 'obj.funds': 'Hold {n} funds', 'obj.jobs': 'Fill {n} jobs', 'obj.income': 'Positive net income of {n}/h',
  'obj.survive': 'Survive the {ev}: at most {n} flooded houses', 'obj.noFlood': 'Keep every house dry', 'obj.stabilityNow': 'Reach stability {n}%',
  'obj.poweredFactories': '{n} factories staffed and powered', 'obj.waterTool': 'Use the water tools: place a water source',
  'warn.funds': 'Funds are negative', 'toast.unlock': 'Unlocked: {x}', 'toast.stage': 'Stage started: {x}',
  'save.campaignSlot': 'Campaign progress is saved separately from your Sandbox world.',
};

const ar = {
  'lang.name': 'العربية', 'lang.toggle': 'English',
  'mode.title': 'اختر طريقة اللعب', 'mode.sub': 'يمكنك التبديل في أي وقت من زر الوضع في الشريط العلوي.',
  'mode.campaign': 'الحملة', 'mode.campaign.d': 'مراحل موجّهة بأهداف ونجوم ومكافآت. عالم اللعب الحر لا يتأثر.',
  'mode.sandbox': 'اللعب الحر', 'mode.sandbox.d': 'بناء حر بكل الأدوات ودون قيود.',
  'mode.continue': 'متابعة', 'mode.start': 'ابدأ', 'mode.back': 'رجوع',
  'mode.switch': 'وضع اللعب…', 'mode.current': 'الوضع',
  'cat.buildings': 'المباني', 'cat.nature': 'الطبيعة', 'cat.infrastructure': 'البنية التحتية', 'cat.water': 'أدوات المياه', 'cat.world': 'إعدادات العالم',
  'b.house_small': 'منزل صغير', 'b.house_medium': 'منزل متوسط', 'b.factory_small': 'مصنع صغير', 'b.tree': 'شجرة', 'b.farm': 'مزرعة',
  'b.water_tank': 'خزان مياه', 'b.road': 'طريق', 'b.solar_plant': 'محطة شمسية', 'b.wind_turbine': 'توربين رياح',
  'bd.house_small': 'منزل دافئ لعائلة صغيرة.', 'bd.house_medium': 'طابقان ومساحة لعائلة أكبر.',
  'bd.factory_small': 'صناعة خفيفة. توظّف السكان وتبيع المنتجات عند توفر الطاقة.', 'bd.tree': 'ازرع شجرة. تتمايل مع الرياح.',
  'bd.farm': 'تنتج الغذاء. يعتمد المحصول على قرب المياه السطحية وعلى الطاقة.', 'bd.water_tank': 'يجمع الماء من الأرض المحيطة. يشرب السكان من الخزانات.',
  'bd.road': 'انقر للبدء ثم انقر مرة أخرى لرسم طريق مستقيم. Esc لإنهاء السلسلة.', 'bd.solar_plant': 'يتبع إنتاجها الشمس وينعدم ليلًا.',
  'bd.wind_turbine': 'إنتاج ثابت يزداد مع الرياح. يعمل ليلًا.',
  'hud.water': 'المياه', 'hud.food': 'الغذاء', 'hud.energy': 'الطاقة', 'hud.funds': 'الأموال', 'hud.stability': 'الاستقرار', 'hud.pop': 'السكان',
  'hud.perh': '/ساعة', 'hud.title': 'حالة المدينة', 'hud.demand': 'الطلب', 'hud.supply': 'الإنتاج',
  'cost': 'التكلفة', 'locked': 'مقفل', 'locked.until': 'يُفتح بإكمال: {stage}', 'cost.no': 'الأموال غير كافية ({cost}).',
  'cost.locked': 'لم يُفتح بعد.', 'unit.res': 'ساكن', 'unit.jobs': 'وظيفة',
  'camp.stages': 'الحملة', 'camp.stars': 'النجوم', 'camp.locked': 'مقفلة', 'camp.open': 'متاحة', 'camp.done': 'مكتملة',
  'camp.difficulty': 'الصعوبة', 'camp.play': 'العب', 'camp.replay': 'أعد اللعب', 'camp.continue': 'تابع', 'camp.restart': 'إعادة المرحلة',
  'camp.objectives': 'الأهداف', 'camp.bonus': 'إضافي', 'camp.progress': 'التقدم', 'camp.unlocks': 'المكافآت', 'camp.env': 'البيئة',
  'camp.starsrule': '★ الإكمال · ★★ خلال {p2} أيام · ★★★ خلال {p3} أيام مع استقرار ≥ {st}٪',
  'camp.menu': 'المراحل', 'camp.exit': 'الخروج إلى القائمة', 'camp.hint': 'تلميح', 'camp.day': 'اليوم', 'camp.of': 'من',
  'camp.events': 'الأحداث', 'camp.event.soon': 'متوقع: {ev} خلال حوالي {h} ساعة', 'camp.event.start': 'بدأ: {ev}!', 'camp.event.end': 'انتهى: {ev}.',
  'ev.rain': 'أمطار غزيرة', 'ev.storm': 'عاصفة', 'ev.drought': 'جفاف',
  'res.title.win': 'اكتملت المرحلة', 'res.title.fail': 'فشلت المرحلة', 'res.stars': 'النجوم المكتسبة', 'res.time': 'الوقت', 'res.days': 'أيام',
  'res.stability': 'الاستقرار النهائي', 'res.min': 'أدنى استقرار', 'res.pop': 'السكان', 'res.funds': 'الأموال', 'res.best': 'الأفضل',
  'res.retry': 'حاول مجددًا', 'res.next': 'المرحلة التالية', 'res.menu': 'قائمة المراحل', 'res.sandbox': 'واصل اللعب', 'res.new': 'مكافآت جديدة',
  'res.fail.pop': 'غادر السكان المستوطنة.', 'res.fail.stab': 'انهارت المستوطنة (بقي الاستقرار قريبًا من الصفر).',
  'res.fail.time': 'انتهى الوقت المسموح لهذه المرحلة.', 'res.allclear': 'أنهيت الحملة!',
  'conf.exit': 'مغادرة المرحلة؟ يُحفظ تقدمك ويمكنك المتابعة لاحقًا.', 'conf.restart': 'إعادة هذه المرحلة من البداية؟',
  'ok': 'حسنًا', 'cancel': 'إلغاء', 'yes': 'نعم',
  'obj.build': 'ابنِ {n} × {name}', 'obj.buildAny': 'ابنِ {n} مباني', 'obj.roads': 'ابنِ {n} قطعة طريق', 'obj.population': 'بلوغ {n} ساكنًا',
  'obj.waterStored': 'خزّن {n} من الماء في الخزانات', 'obj.foodStock': 'خزّن {n} من الغذاء', 'obj.farmsIrrigated': '{n} مزارع مروية (مياه سطحية قريبة)',
  'obj.energySupply': 'أنتج {n} من الطاقة', 'obj.energyBalance': 'أبقِ إنتاج الطاقة ≥ الطلب لمدة {h} ساعة', 'obj.needs': 'أبقِ الماء والغذاء كافيين لمدة {h} ساعة',
  'obj.stability': 'أبقِ الاستقرار ≥ {n}٪ لمدة {h} ساعة', 'obj.funds': 'امتلك {n} من الأموال', 'obj.jobs': 'املأ {n} وظيفة', 'obj.income': 'دخل صافٍ موجب بمقدار {n}/ساعة',
  'obj.survive': 'اجتز {ev}: بما لا يزيد عن {n} منازل غارقة', 'obj.noFlood': 'أبقِ كل المنازل جافة', 'obj.stabilityNow': 'بلوغ استقرار {n}٪',
  'obj.poweredFactories': '{n} مصانع مشغَّلة بالعمال والطاقة', 'obj.waterTool': 'استخدم أدوات المياه: ضع مصدر ماء',
  'warn.funds': 'الأموال بالسالب', 'toast.unlock': 'تم فتح: {x}', 'toast.stage': 'بدأت المرحلة: {x}',
  'save.campaignSlot': 'يُحفظ تقدم الحملة بشكل منفصل عن عالم اللعب الحر.',
};

class I18n extends Emitter {
  constructor() {
    super();
    this.dict = { en, ar };
    this.lang = 'en';
    try { const s = localStorage.getItem(LS); if (s === 'ar' || s === 'en') this.lang = s; else if ((navigator.language || '').startsWith('ar')) this.lang = 'ar'; } catch { /* ignore */ }
    this.apply();
  }
  add(lang, obj) { Object.assign(this.dict[lang], obj); }
  t(key, vars) {
    let s = this.dict[this.lang][key] ?? this.dict.en[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
    return s;
  }
  num(n) { return this.lang === 'ar' ? Number(n).toLocaleString('ar-EG') : Number(n).toLocaleString('en-US'); }
  set(lang) {
    if (lang !== 'ar' && lang !== 'en') return;
    this.lang = lang;
    try { localStorage.setItem(LS, lang); } catch { /* ignore */ }
    this.apply(); this.emit('change', lang);
  }
  toggle() { this.set(this.lang === 'ar' ? 'en' : 'ar'); }
  apply() {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = this.lang;
    document.documentElement.dir = this.lang === 'ar' ? 'rtl' : 'ltr';
  }
}

export const i18n = new I18n();
export const t = (k, v) => i18n.t(k, v);
