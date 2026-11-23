// Runtime Arabic translation layer. English source strings stay in the code; this
// module translates text nodes / title / aria-label as they appear in the DOM.
// Switch language from World Settings (stored in localStorage, page reloads).
const KEY = 'worldshift.lang';
export const getLang = () => { try { return localStorage.getItem(KEY) || 'ar'; } catch { return 'ar'; } };
export const setLang = (l) => { try { localStorage.setItem(KEY, l); } catch { /* ignore */ } location.reload(); };

const D = {
  // simulation / camera
  'One finger: rotate / move': 'إصبع واحد: تدوير / تحريك', 'One finger rotates the view': 'إصبع واحد يدوّر الكاميرا', 'One finger moves the view': 'إصبع واحد يحرّك الكاميرا',
  'Reset camera (Home)': 'إعادة الكاميرا (Home)', 'Rotate left (Q)': 'تدوير لليسار (Q)', 'Rotate right (E)': 'تدوير لليمين (E)', 'Change tilt': 'تغيير الميل', 'Zoom in (+)': 'تقريب (+)', 'Zoom out (−)': 'تبعيد (−)',
  'Play / Pause': 'تشغيل / إيقاف', 'Play / Pause (Space)': 'تشغيل / إيقاف (Space)', 'Reset': 'إعادة ضبط', 'Reset the water and the clock (buildings are kept)': 'إعادة الماء والساعة (المباني تبقى)',
  'Reset simulation?': 'إعادة ضبط المحاكاة؟', 'The water returns to its starting state and the clock restarts. Your buildings and roads are kept.': 'يعود الماء لوضعه الأول وتبدأ الساعة من جديد. مبانيك وطرقك تبقى كما هي.',
  'Simulation reset': 'تمت إعادة ضبط المحاكاة', 'Paused': 'متوقف مؤقتًا', 'Close': 'إغلاق', 'Cancel': 'إلغاء',
  // save / world
  'World saved': 'تم حفظ العالم', 'World loaded': 'تم تحميل العالم', 'Load saved world?': 'تحميل العالم المحفوظ؟', 'Your current world will be replaced by the last saved one.': 'سيُستبدل عالمك الحالي بآخر نسخة محفوظة.', 'Load': 'تحميل',
  'Reset the water?': 'إعادة ضبط الماء؟', 'All water returns to the lake and river of the starting world. Buildings stay.': 'يعود كل الماء إلى البحيرة والنهر كما في البداية. المباني تبقى.', 'Reset water': 'إعادة الماء', 'Water reset': 'تمت إعادة الماء', 'All water removed': 'تمت إزالة كل الماء',
  'New world': 'عالم جديد', 'New World': 'عالم جديد', 'This replaces your current world (the current save is overwritten as soon as you start playing).': 'سيحل محل عالمك الحالي (يُستبدل الحفظ الحالي بمجرد أن تبدأ اللعب).', 'Classic valley (default map)': 'الوادي الكلاسيكي (الخريطة الأصلية)', 'Random world': 'عالم عشوائي',
  'New world created': 'تم إنشاء عالم جديد', 'New random world created': 'تم إنشاء عالم عشوائي جديد', 'Save failed': 'فشل الحفظ', 'Could not save (storage unavailable or full).': 'تعذّر الحفظ (التخزين غير متاح أو ممتلئ).', 'Load failed': 'فشل التحميل', 'The save file could not be loaded.': 'تعذّر تحميل ملف الحفظ.',
  'Welcome back': 'أهلًا بعودتك', 'Generating world…': 'جارٍ إنشاء العالم…', 'WebGL is not available': 'WebGL غير متاح', 'TERRA needs a browser with WebGL 2 enabled. Please try an up-to-date Chrome, Edge, Firefox or Safari.': 'تحتاج اللعبة متصفحًا يدعم WebGL 2. جرّب نسخة حديثة من Chrome أو Edge أو Firefox أو Safari.',
  'Population': 'السكان', 'Buildings': 'المباني', 'Simulation state': 'حالة المحاكاة', 'Game settings': 'إعدادات اللعبة', 'Categories': 'الفئات',
  // categories / objects
  'Nature': 'الطبيعة', 'Infrastructure': 'البنية التحتية', 'Water Tools': 'أدوات المياه', 'Water tools': 'أدوات المياه', 'World Settings': 'إعدادات العالم', 'World': 'العالم', 'Water': 'الماء', 'Terrain': 'التضاريس', 'Roads': 'طرق', 'Road': 'طريق', 'Road segment': 'قطعة طريق', 'Building': 'مبنى',
  'Small House': 'منزل صغير', 'A cosy home for a small family.': 'بيت دافئ لأسرة صغيرة.', 'Medium House': 'منزل متوسط', 'Two floors, room for a larger family.': 'طابقان ومساحة لأسرة أكبر.',
  'Small Factory': 'مصنع صغير', 'Light industry. Provides jobs (used by the economy in later phases).': 'صناعة خفيفة. توفر وظائف (تُستخدم في الاقتصاد بالمراحل القادمة).',
  'Tree': 'شجرة', 'Plant a tree. It sways in the wind.': 'ازرع شجرة. تتمايل مع الرياح.', 'Farm': 'مزرعة', 'Crops and a barn. Does best close to water.': 'محاصيل وحظيرة. تنجح أكثر قرب الماء.',
  'Water Tank': 'خزان مياه', 'Collects water from the surrounding ground and stores it.': 'يجمع الماء من الأرض حوله ويخزنه.', 'Click to start, click again to draw a straight road. Esc ends the chain.': 'اضغط للبدء ثم اضغط مرة أخرى لرسم طريق مستقيم. Esc ينهي السلسلة.',
  'A paved tile that follows the ground.': 'قطعة مرصوفة تتبع شكل الأرض.', 'Water source': 'مصدر مياه', 'Water Source': 'مصدر مياه', 'Adds water to the world at a steady rate while sources are flowing.': 'يضخ الماء في العالم بمعدل ثابت طالما المصادر تعمل.',
  'Flows downhill and collects in low ground.': 'يجري نحو الأسفل ويتجمع في الأراضي المنخفضة.', 'Natural ground.': 'أرض طبيعية.',
  // info panel
  'Footprint': 'المساحة', 'Elevation': 'الارتفاع', 'Residents': 'السكان', 'Jobs offered': 'وظائف متاحة', 'Stored water': 'الماء المخزّن', 'Irrigation': 'الري', 'None nearby': 'لا يوجد قريب', 'Excellent': 'ممتاز', 'Good': 'جيد',
  'Flood status': 'حالة الفيضان', 'Flooding': 'فيضان', 'Water nearby': 'ماء قريب', 'Dry': 'جاف', 'Cell': 'الخلية', 'State': 'الحالة', 'Flowing': 'يعمل', 'Stopped': 'متوقف', 'Effective rate': 'المعدل الفعلي', 'Node': 'العقدة',
  'Depth': 'العمق', 'Surface level': 'مستوى السطح', 'Flow speed': 'سرعة التدفق', 'Slope': 'الانحدار', 'Buildable': 'قابل للبناء', 'Yes': 'نعم', 'Delete': 'حذف', 'Strength': 'القوة',
  // action bar / hints / reasons
  'Rotate (R)': 'تدوير (R)', 'Place (Enter)': 'تثبيت (Enter)', 'Cancel (Esc)': 'إلغاء (Esc)', 'Place': 'تثبيت',
  'Click to place': 'اضغط للتثبيت', 'Tap ✓ to place': 'المس ✓ للتثبيت', 'Click to start a road': 'اضغط لبدء الطريق', 'Tap ✓ to start the road': 'المس ✓ لبدء الطريق', 'Nothing can be built here': 'لا يمكن البناء هنا', 'Cannot build here': 'لا يمكن البناء هنا',
  'Click to place a water source': 'اضغط لوضع مصدر مياه', 'Tap ✓ to place a water source': 'المس ✓ لوضع مصدر مياه', 'Hold left mouse to pour water': 'اضغط مطولًا بزر الفأرة الأيسر لصب الماء', 'Hold left mouse to drain water': 'اضغط مطولًا بزر الفأرة الأيسر لتصريف الماء',
  'Press and hold to pour water': 'اضغط مطولًا لصب الماء', 'Press and hold to drain water': 'اضغط مطولًا لتصريف الماء',
  'Outside the buildable area': 'خارج منطقة البناء', 'Space is occupied': 'المكان مشغول', 'A road is in the way': 'يوجد طريق في المكان', 'Cannot build on water': 'لا يمكن البناء على الماء', 'Ground is too steep': 'الأرض شديدة الانحدار', 'Too high (snow line)': 'مرتفع جدًا (خط الثلج)',
  'Road already here': 'الطريق موجود بالفعل', 'Outside the world': 'خارج العالم', 'Another source is too close': 'يوجد مصدر آخر قريب جدًا', 'Source limit reached': 'تم بلوغ حد المصادر', 'Limit reached for this building': 'تم بلوغ الحد الأقصى لهذا المبنى',
  // panels
  'Roads follow the terrain. Water tanks drain the water around them.': 'الطرق تتبع التضاريس. خزانات المياه تسحب الماء حولها.', 'Trees and farms can be placed anywhere that is dry and flat enough.': 'يمكن وضع الأشجار والمزارع في أي مكان جاف ومستوٍ بما يكفي.',
  'Pick a building, move it over the ground and place it. Green means the spot is valid.': 'اختر مبنى وحرّكه فوق الأرض ثم ثبّته. الأخضر يعني أن المكان صالح.',
  'Add Water': 'إضافة ماء', 'Hold to pour': 'اضغط مطولًا للصب', 'Endless spring': 'نبع لا ينضب', 'Drain': 'تصريف', 'Hold to remove': 'اضغط مطولًا للإزالة', 'Flow': 'الجريان', 'Sources are flowing': 'المصادر تعمل', 'Source strength': 'قوة المصادر', 'Brush size': 'حجم الفرشاة',
  'Live': 'مباشر', 'Water volume': 'حجم الماء', 'Wet area': 'المساحة المبتلة', 'Sources': 'المصادر', 'Dry up': 'تجفيف', 'Tap a source in Select mode to change its strength or delete it. Buildings block water; water tanks collect it.': 'المس مصدرًا في وضع التحديد لتغيير قوته أو حذفه. المباني تحجب الماء والخزانات تجمعه.',
  'Time & atmosphere': 'الوقت والجو', 'Time of day': 'وقت اليوم', 'Day / night cycle': 'دورة النهار والليل', 'Wind': 'الرياح', 'Clouds': 'الغيوم', 'Always show build grid': 'إظهار شبكة البناء دائمًا',
  'Language': 'اللغة', 'Graphics': 'الرسوميات', 'Auto': 'تلقائي', 'High': 'عالية', 'Balanced': 'متوسطة', 'Low': 'منخفضة', 'Auto lowers the resolution if the frame rate drops.': 'الوضع التلقائي يخفض الدقة إذا انخفضت الفريمات.',
  'Frame limit': 'سقف الفريمات', 'No limit': 'بدون حد', 'A lower limit saves battery and heat.': 'سقف أقل يوفّر البطارية ويقلل السخونة.', 'Frame rate': 'معدل الفريمات', 'Resolution scale': 'مقياس الدقة',
  'Seed': 'بذرة العالم', 'Last saved': 'آخر حفظ', 'never': 'أبدًا', 'Save World': 'حفظ العالم', 'Load World': 'تحميل العالم', 'The world is saved automatically every few seconds in this browser.': 'يُحفظ العالم تلقائيًا كل بضع ثوانٍ في هذا المتصفح.', 'Controls': 'التحكم',
  'Drag: rotate · Right-drag / Shift+drag: move · Wheel: zoom · WASD/arrows: move · Q/E: turn · R: rotate building · Esc: cancel · Space: play/pause. On touch: one finger rotates or moves (button on the right), two fingers pinch, move and twist.':
    'سحب: تدوير · سحب بالزر الأيمن / Shift+سحب: تحريك · العجلة: تقريب · WASD/الأسهم: حركة · Q/E: دوران · R: تدوير المبنى · Esc: إلغاء · Space: تشغيل/إيقاف. باللمس: إصبع واحد للتدوير أو التحريك (الزر الجانبي)، وإصبعان للتقريب والتحريك والدوران.',
};
const P = [
  [/^Running ×(\d+)$/, (m) => `يعمل ×${m[1]}`], [/^Day (\d+)$/, (m) => `اليوم ${m[1]}`], [/^(\d+) fps$/, (m) => `${m[1]} إطار/ث`],
  [/^(\d+) \(stopped\)$/, (m) => `${m[1]} (متوقفة)`], [/^(\d+)×(\d+) cells · (.+)$/, (m) => `${m[1]}×${m[2]} خلية · ${m[3]}`],
  [/^(\d+×\d+) · (\d+) residents$/, (m) => `${m[1]} · ${m[2]} ساكن`], [/^(\d+×\d+) · (\d+) jobs$/, (m) => `${m[1]} · ${m[2]} وظيفة`],
  [/^(.+) placed$/, (m) => `تم وضع ${tr(m[1]) || m[1]}`], [/^(.+) removed$/, (m) => `تم حذف ${tr(m[1]) || m[1]}`],
  [/^(\d+) road tiles? built$/, (m) => `تم بناء ${m[1]} قطعة طريق`], [/^Click to build (\d+) road tiles? \(Esc to stop\)$/, (m) => `اضغط لبناء ${m[1]} قطعة طريق (Esc للإيقاف)`],
  [/^Tap ✓ to build (\d+) tiles?$/, (m) => `المس ✓ لبناء ${m[1]} قطعة`], [/^Something went wrong: (.*)$/, (m) => `حدث خطأ: ${m[1]}`],
];
const AR = /[\u0600-\u06FF]/;
export function tr(s) {
  const k = String(s).replace(/\s+/g, ' ').trim();
  if (!k || AR.test(k)) return null;
  if (D[k]) return D[k];
  for (const [r, f] of P) { const m = r.exec(k); if (m) return f(m); }
  return null;
}
function txt(n) {
  const v = n.nodeValue, k = v && v.trim(); if (!k) return;
  const t = tr(k); if (!t) return;
  n.nodeValue = v.replace(k, t);
  const p = n.parentElement; if (p && !p.hasAttribute('dir')) p.setAttribute('dir', 'auto');
}
function attr(el, a) { const v = el.getAttribute(a), t = v && tr(v); if (t) el.setAttribute(a, t); }
function scan(root) {
  if (root.nodeType === 3) return txt(root);
  if (root.nodeType !== 1) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) txt(n);
  for (const el of [root, ...root.querySelectorAll('[title],[aria-label]')]) { attr(el, 'title'); attr(el, 'aria-label'); }
}
export function initI18n() {
  if (getLang() !== 'ar') return;
  document.documentElement.lang = 'ar';
  scan(document.body);
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') txt(m.target);
      else if (m.type === 'attributes') attr(m.target, m.attributeName);
      else m.addedNodes.forEach(scan);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label'] });
}
