// 食物营养库：食堂/家常常见食物，按 1 份（可食部）估算蛋白质与热量。
// 数据来源：中国食物成分表（第 6 版）常见条目 + 常见外卖/食堂份量修正。
// 由桌面版 src/data/foods.ts 机械转换而来（去掉 TS 类型标注）。

/** 默认每日蛋白质目标（可被设置覆盖） */
const PROTEIN_TARGET = 110;
const CALORIE_TARGET = 2400;

/**
 * 按体重估算蛋白质目标：1.6–2.2 g/kg。
 * 默认取 1.8 g/kg，四舍五入到 5 的倍数，好记。
 */
function proteinTargetFor(weightKg, factor) {
  const f = factor === undefined ? 1.8 : factor;
  if (!weightKg || weightKg <= 0) return PROTEIN_TARGET;
  return Math.round((weightKg * f) / 5) * 5;
}

const CATEGORIES = ['肉类', '蛋奶', '水产', '豆制品', '主食', '蔬菜', '水果', '外卖快餐', '零食饮料', '补剂'];

const FOODS = [
  // ── 肉类 ──────────────────────────────────────────
  { id: 'chicken-leg', name: '鸡腿', alias: ['鸡腿肉', '烤鸡腿', '卤鸡腿', '琵琶腿'], unit: '1 个（约 100g）', protein: 20, calories: 180, category: '肉类' },
  { id: 'chicken-breast', name: '鸡胸肉', alias: ['鸡胸', '水煮鸡胸', '煎鸡胸'], unit: '1 块（约 120g）', protein: 28, calories: 150, category: '肉类' },
  { id: 'chicken-wing', name: '鸡翅', alias: ['鸡中翅', '烤翅'], unit: '1 个（约 45g）', protein: 7, calories: 90, category: '肉类' },
  { id: 'chicken-feet', name: '鸡爪', alias: ['凤爪', '卤鸡爪'], unit: '1 个（约 40g）', protein: 4, calories: 100, category: '肉类' },
  { id: 'chicken-liver', name: '鸡肝', unit: '1 份（约 60g）', protein: 10, calories: 75, category: '肉类' },
  { id: 'chicken-gizzard', name: '鸡胗', alias: ['鸡珍'], unit: '1 份（约 80g）', protein: 15, calories: 95, category: '肉类' },
  { id: 'fried-chicken', name: '炸鸡', alias: ['炸鸡块', '鸡米花'], unit: '1 份（约 120g）', protein: 22, calories: 380, category: '肉类' },
  { id: 'chicken-cutlet', name: '鸡排', alias: ['炸鸡排', '大鸡排'], unit: '1 块（约 150g）', protein: 25, calories: 420, category: '肉类' },
  { id: 'pork-lean', name: '瘦猪肉', alias: ['猪肉', '里脊', '猪里脊'], unit: '1 份（约 100g）', protein: 20, calories: 155, category: '肉类' },
  { id: 'pork-belly', name: '红烧肉', alias: ['五花肉', '扣肉'], unit: '1 份（约 100g）', protein: 9, calories: 460, category: '肉类' },
  { id: 'pork-ribs', name: '排骨', alias: ['糖醋排骨', '红烧排骨'], unit: '1 份（约 120g）', protein: 18, calories: 290, category: '肉类' },
  { id: 'pork-hock', name: '猪蹄', alias: ['红烧猪蹄'], unit: '1 份（约 120g）', protein: 20, calories: 320, category: '肉类' },
  { id: 'pork-liver', name: '猪肝', alias: ['炒猪肝'], unit: '1 份（约 80g）', protein: 15, calories: 105, category: '肉类' },
  { id: 'lion-head', name: '红烧狮子头', alias: ['狮子头', '四喜丸子'], unit: '1 个（约 80g）', protein: 10, calories: 230, category: '肉类' },
  { id: 'beef', name: '牛肉', alias: ['酱牛肉', '卤牛肉'], unit: '1 份（约 100g）', protein: 20, calories: 200, category: '肉类' },
  { id: 'beef-brisket', name: '牛腩', alias: ['炖牛腩', '番茄牛腩'], unit: '1 份（约 100g）', protein: 18, calories: 280, category: '肉类' },
  { id: 'fatty-beef', name: '肥牛', alias: ['肥牛卷', '涮肥牛'], unit: '1 份（约 100g）', protein: 16, calories: 300, category: '肉类' },
  { id: 'lamb', name: '羊肉', unit: '1 份（约 100g）', protein: 19, calories: 210, category: '肉类' },
  { id: 'lamb-skewer', name: '羊肉串', alias: ['烤串', '烧烤串'], unit: '1 串（约 30g）', protein: 5, calories: 90, category: '肉类' },
  { id: 'duck-roast', name: '烤鸭', alias: ['北京烤鸭', '片鸭'], unit: '1 份（约 100g）', protein: 16, calories: 330, category: '肉类' },
  { id: 'duck-leg', name: '鸭腿', alias: ['卤鸭腿'], unit: '1 个（约 120g）', protein: 20, calories: 250, category: '肉类' },
  { id: 'sausage', name: '香肠', alias: ['火腿肠', '烤肠'], unit: '1 根（约 40g）', protein: 5, calories: 130, category: '肉类' },
  { id: 'bacon', name: '培根', unit: '1 片（约 20g）', protein: 4, calories: 90, category: '肉类' },
  { id: 'luncheon-meat', name: '午餐肉', unit: '1 片（约 30g）', protein: 4, calories: 100, category: '肉类' },
  { id: 'meatball', name: '牛肉丸', alias: ['贡丸', '撒尿牛丸'], unit: '1 个（约 20g）', protein: 3, calories: 45, category: '肉类' },

  // ── 蛋奶 ──────────────────────────────────────────
  { id: 'egg', name: '鸡蛋', alias: ['水煮蛋', '煎蛋', '荷包蛋', '蛋', '白煮蛋'], unit: '1 个（约 55g）', protein: 6.5, calories: 75, category: '蛋奶' },
  { id: 'egg-white', name: '蛋白', alias: ['蛋清'], unit: '1 个', protein: 3.5, calories: 17, category: '蛋奶' },
  { id: 'quail-egg', name: '鹌鹑蛋', unit: '1 个', protein: 1.5, calories: 20, category: '蛋奶' },
  { id: 'tea-egg', name: '卤蛋', alias: ['茶叶蛋'], unit: '1 个', protein: 7, calories: 90, category: '蛋奶' },
  { id: 'steamed-egg', name: '蒸蛋', alias: ['鸡蛋羹', '水蒸蛋'], unit: '1 份', protein: 8, calories: 110, category: '蛋奶' },
  { id: 'milk', name: '牛奶', alias: ['纯牛奶', '全脂奶'], unit: '1 盒（250ml）', protein: 8, calories: 160, category: '蛋奶' },
  { id: 'skim-milk', name: '脱脂牛奶', alias: ['低脂奶'], unit: '1 盒（250ml）', protein: 8.5, calories: 90, category: '蛋奶' },
  { id: 'yogurt', name: '酸奶', unit: '1 杯（150g）', protein: 5, calories: 110, category: '蛋奶' },
  { id: 'greek-yogurt', name: '希腊酸奶', alias: ['无糖酸奶'], unit: '1 杯（150g）', protein: 12, calories: 130, category: '蛋奶' },
  { id: 'cheese', name: '奶酪', alias: ['芝士', '芝士片'], unit: '1 片（20g）', protein: 5, calories: 70, category: '蛋奶' },
  { id: 'milk-powder', name: '奶粉', unit: '1 勺（25g）', protein: 6, calories: 120, category: '蛋奶' },
  { id: 'butter', name: '黄油', unit: '1 小块（10g）', protein: 0.1, calories: 75, category: '蛋奶' },

  // ── 水产 ──────────────────────────────────────────
  { id: 'fish', name: '鱼', alias: ['清蒸鱼', '烤鱼', '鱼肉'], unit: '1 份（约 100g）', protein: 18, calories: 120, category: '水产' },
  { id: 'salmon', name: '三文鱼', alias: ['鲑鱼', '三文鱼刺身'], unit: '1 份（约 100g）', protein: 20, calories: 200, category: '水产' },
  { id: 'hairtail', name: '带鱼', alias: ['红烧带鱼', '煎带鱼'], unit: '1 份（约 100g）', protein: 18, calories: 180, category: '水产' },
  { id: 'yellow-croaker', name: '黄花鱼', alias: ['黄鱼'], unit: '1 份（约 100g）', protein: 18, calories: 110, category: '水产' },
  { id: 'bass', name: '鲈鱼', unit: '1 份（约 100g）', protein: 18, calories: 105, category: '水产' },
  { id: 'grass-carp', name: '草鱼', alias: ['水煮鱼', '酸菜鱼'], unit: '1 份（约 100g）', protein: 17, calories: 130, category: '水产' },
  { id: 'shrimp', name: '虾', alias: ['基围虾', '白灼虾'], unit: '1 份（约 100g）', protein: 18, calories: 95, category: '水产' },
  { id: 'shrimp-meat', name: '虾仁', alias: ['清炒虾仁'], unit: '1 份（约 100g）', protein: 19, calories: 100, category: '水产' },
  { id: 'squid', name: '鱿鱼', alias: ['铁板鱿鱼', '鱿鱼须'], unit: '1 份（约 100g）', protein: 17, calories: 90, category: '水产' },
  { id: 'clam', name: '蛤蜊', alias: ['花蛤', '爆炒花蛤'], unit: '1 份（约 100g）', protein: 10, calories: 62, category: '水产' },
  { id: 'crab', name: '螃蟹', alias: ['大闸蟹', '梭子蟹'], unit: '1 只（约 150g）', protein: 18, calories: 100, category: '水产' },
  { id: 'crayfish', name: '小龙虾', alias: ['麻辣小龙虾', '口味虾'], unit: '1 份（约 200g）', protein: 20, calories: 220, category: '水产' },
  { id: 'octopus', name: '章鱼', alias: ['八爪鱼'], unit: '1 份（约 100g）', protein: 16, calories: 85, category: '水产' },
  { id: 'fish-ball', name: '鱼丸', unit: '1 个（约 20g）', protein: 2.5, calories: 35, category: '水产' },
  { id: 'kelp', name: '海带', alias: ['海带丝', '凉拌海带'], unit: '1 份（约 100g）', protein: 1.2, calories: 25, category: '水产' },
  { id: 'seaweed', name: '紫菜', alias: ['紫菜汤'], unit: '1 份', protein: 2, calories: 20, category: '水产' },

  // ── 豆制品 ────────────────────────────────────────
  { id: 'tofu', name: '豆腐', alias: ['家常豆腐', '嫩豆腐', '烧豆腐'], unit: '1 份（约 100g）', protein: 8, calories: 85, category: '豆制品' },
  { id: 'mapo-tofu', name: '麻婆豆腐', unit: '1 份（约 150g）', protein: 12, calories: 220, category: '豆制品' },
  { id: 'dried-tofu', name: '豆干', alias: ['香干', '卤豆干'], unit: '1 份（约 80g）', protein: 13, calories: 130, category: '豆制品' },
  { id: 'tofu-skin', name: '腐竹', alias: ['凉拌腐竹'], unit: '1 份（约 60g）', protein: 14, calories: 160, category: '豆制品' },
  { id: 'thousand-sheet', name: '千张', alias: ['豆皮', '百叶'], unit: '1 份（约 80g）', protein: 13, calories: 140, category: '豆制品' },
  { id: 'fried-tofu', name: '油豆腐', alias: ['豆泡', '油豆泡'], unit: '1 个（约 20g）', protein: 3, calories: 50, category: '豆制品' },
  { id: 'tofu-pudding', name: '豆腐脑', alias: ['豆花'], unit: '1 碗', protein: 5, calories: 60, category: '豆制品' },
  { id: 'fermented-tofu', name: '腐乳', alias: ['豆腐乳'], unit: '1 块（约 15g）', protein: 1.5, calories: 25, category: '豆制品' },
  { id: 'soybean', name: '酱黄豆', alias: ['黄豆', '煮黄豆'], unit: '1 份（约 80g）', protein: 12, calories: 130, category: '豆制品' },
  { id: 'edamame', name: '毛豆', alias: ['盐水毛豆'], unit: '1 份（约 100g）', protein: 12, calories: 130, category: '豆制品' },
  { id: 'bean-sprout', name: '豆芽', alias: ['绿豆芽', '黄豆芽', '炒豆芽'], unit: '1 份（约 150g）', protein: 3, calories: 60, category: '豆制品' },
  { id: 'soymilk', name: '豆浆', unit: '1 杯（300ml）', protein: 6, calories: 90, category: '豆制品' },

  // ── 主食 ──────────────────────────────────────────
  { id: 'rice', name: '米饭', alias: ['白米饭', '大米饭', '一碗米饭'], unit: '1 两（约 130g）', protein: 3.5, calories: 170, category: '主食' },
  { id: 'rice-2', name: '米饭（二两）', alias: ['米饭二两', '大碗米饭'], unit: '2 两（约 260g）', protein: 7, calories: 340, category: '主食' },
  { id: 'brown-rice', name: '糙米饭', alias: ['糙米'], unit: '1 碗（约 150g）', protein: 4.5, calories: 200, category: '主食' },
  { id: 'glutinous-rice', name: '糯米饭', alias: ['糯米'], unit: '1 碗（约 150g）', protein: 4, calories: 240, category: '主食' },
  { id: 'noodle', name: '面条', alias: ['汤面', '拌面', '素面'], unit: '1 碗', protein: 10, calories: 400, category: '主食' },
  { id: 'ramen', name: '拉面', alias: ['兰州拉面', '牛肉拉面'], unit: '1 碗', protein: 20, calories: 560, category: '主食' },
  { id: 'knife-noodle', name: '刀削面', unit: '1 碗', protein: 16, calories: 520, category: '主食' },
  { id: 'rice-noodle', name: '米线', alias: ['过桥米线', '小锅米线'], unit: '1 碗', protein: 12, calories: 450, category: '主食' },
  { id: 'fried-noodle', name: '炒面', alias: ['炒面条'], unit: '1 份', protein: 14, calories: 580, category: '主食' },
  { id: 'rice-noodle-roll', name: '河粉', alias: ['炒河粉', '干炒牛河'], unit: '1 份', protein: 12, calories: 520, category: '主食' },
  { id: 'bun', name: '包子', alias: ['肉包', '菜包', '大包子'], unit: '1 个', protein: 6, calories: 220, category: '主食' },
  { id: 'xiaolongbao', name: '小笼包', alias: ['汤包'], unit: '1 个', protein: 3, calories: 60, category: '主食' },
  { id: 'mantou', name: '馒头', unit: '1 个', protein: 7, calories: 230, category: '主食' },
  { id: 'flower-roll', name: '花卷', unit: '1 个', protein: 6, calories: 210, category: '主食' },
  { id: 'wonton', name: '馄饨', alias: ['云吞', '抄手'], unit: '10 个', protein: 12, calories: 350, category: '主食' },
  { id: 'dumpling', name: '饺子', alias: ['水饺', '蒸饺'], unit: '10 个', protein: 15, calories: 450, category: '主食' },
  { id: 'bread', name: '面包', alias: ['吐司', '白面包'], unit: '1 片', protein: 3, calories: 90, category: '主食' },
  { id: 'whole-wheat-bread', name: '全麦面包', alias: ['全麦吐司'], unit: '1 片', protein: 4, calories: 80, category: '主食' },
  { id: 'biscuit', name: '饼干', unit: '1 包（约 100g）', protein: 8, calories: 480, category: '主食' },
  { id: 'oats', name: '燕麦', alias: ['燕麦片', '麦片'], unit: '1 份（40g）', protein: 6, calories: 150, category: '主食' },
  { id: 'congee', name: '白粥', alias: ['粥', '稀饭'], unit: '1 碗', protein: 2, calories: 90, category: '主食' },
  { id: 'fried-dough', name: '油条', unit: '1 根', protein: 4, calories: 270, category: '主食' },
  { id: 'pancake', name: '煎饼', alias: ['杂粮煎饼', '煎饼果子'], unit: '1 个', protein: 9, calories: 400, category: '主食' },
  { id: 'hand-pancake', name: '手抓饼', unit: '1 个', protein: 7, calories: 350, category: '主食' },
  { id: 'zongzi', name: '粽子', alias: ['肉粽'], unit: '1 个', protein: 6, calories: 350, category: '主食' },
  { id: 'rice-cake', name: '年糕', alias: ['炒年糕'], unit: '1 份（约 120g）', protein: 4, calories: 260, category: '主食' },
  { id: 'tangyuan', name: '汤圆', unit: '5 个', protein: 4, calories: 280, category: '主食' },
  { id: 'sweet-potato', name: '红薯', alias: ['地瓜', '烤红薯'], unit: '1 个（约 150g）', protein: 2, calories: 130, category: '主食' },
  { id: 'purple-potato', name: '紫薯', unit: '1 个（约 120g）', protein: 2, calories: 120, category: '主食' },
  { id: 'yam', name: '山药', unit: '1 份（约 120g）', protein: 2, calories: 70, category: '主食' },
  { id: 'potato', name: '土豆', alias: ['蒸土豆', '煮土豆'], unit: '1 个（约 150g）', protein: 3, calories: 115, category: '主食' },
  { id: 'corn', name: '玉米', alias: ['水煮玉米', '甜玉米'], unit: '1 根', protein: 4, calories: 130, category: '主食' },
  { id: 'quinoa', name: '藜麦', unit: '1 份（50g 干）', protein: 7, calories: 180, category: '主食' },

  // ── 蔬菜 ──────────────────────────────────────────
  { id: 'greens', name: '炒青菜', alias: ['青菜', '小白菜', '炒时蔬', '蔬菜', '清炒时蔬'], unit: '1 份（约 150g）', protein: 3, calories: 90, category: '蔬菜' },
  { id: 'lettuce', name: '生菜', alias: ['蚝油生菜'], unit: '1 份（约 150g）', protein: 2, calories: 50, category: '蔬菜' },
  { id: 'spinach', name: '菠菜', alias: ['炒菠菜'], unit: '1 份（约 150g）', protein: 4, calories: 70, category: '蔬菜' },
  { id: 'cabbage', name: '白菜', alias: ['大白菜', '醋溜白菜'], unit: '1 份（约 150g）', protein: 2, calories: 55, category: '蔬菜' },
  { id: 'youmaicai', name: '油麦菜', alias: ['蒜蓉油麦菜'], unit: '1 份（约 150g）', protein: 3, calories: 65, category: '蔬菜' },
  { id: 'water-spinach', name: '空心菜', alias: ['通菜'], unit: '1 份（约 150g）', protein: 3, calories: 70, category: '蔬菜' },
  { id: 'broccoli', name: '西兰花', alias: ['西蓝花', '西兰花炒木耳'], unit: '1 份（约 150g）', protein: 5, calories: 100, category: '蔬菜' },
  { id: 'cauliflower', name: '花菜', alias: ['菜花', '有机花菜'], unit: '1 份（约 150g）', protein: 3, calories: 85, category: '蔬菜' },
  { id: 'eggplant', name: '茄子', alias: ['红烧茄子', '鱼香茄子'], unit: '1 份（约 150g）', protein: 2, calories: 150, category: '蔬菜' },
  { id: 'green-pepper', name: '青椒', alias: ['尖椒', '青椒炒蛋'], unit: '1 份（约 120g）', protein: 2, calories: 70, category: '蔬菜' },
  { id: 'tomato-egg', name: '西红柿炒蛋', alias: ['番茄炒蛋'], unit: '1 份', protein: 9, calories: 200, category: '蔬菜' },
  { id: 'tomato', name: '西红柿', alias: ['番茄'], unit: '1 个（约 150g）', protein: 1.5, calories: 30, category: '蔬菜' },
  { id: 'potato-shred', name: '炒土豆丝', alias: ['酸辣土豆丝'], unit: '1 份', protein: 3, calories: 180, category: '蔬菜' },
  { id: 'cucumber', name: '黄瓜', alias: ['拍黄瓜', '凉拌黄瓜'], unit: '1 根', protein: 1, calories: 25, category: '蔬菜' },
  { id: 'carrot', name: '胡萝卜', unit: '1 根（约 100g）', protein: 1, calories: 40, category: '蔬菜' },
  { id: 'pumpkin', name: '南瓜', alias: ['蒸南瓜'], unit: '1 份（约 150g）', protein: 1.5, calories: 55, category: '蔬菜' },
  { id: 'winter-melon', name: '冬瓜', alias: ['冬瓜汤'], unit: '1 份（约 150g）', protein: 0.6, calories: 30, category: '蔬菜' },
  { id: 'lotus-root', name: '莲藕', alias: ['藕片', '凉拌藕片'], unit: '1 份（约 120g）', protein: 2, calories: 85, category: '蔬菜' },
  { id: 'radish', name: '白萝卜', alias: ['萝卜'], unit: '1 份（约 150g）', protein: 1, calories: 35, category: '蔬菜' },
  { id: 'onion', name: '洋葱', alias: ['洋葱炒蛋'], unit: '1 份（约 100g）', protein: 1.5, calories: 45, category: '蔬菜' },
  { id: 'celery', name: '芹菜', alias: ['芹菜炒肉'], unit: '1 份（约 150g）', protein: 2, calories: 55, category: '蔬菜' },
  { id: 'leek', name: '韭菜', alias: ['韭菜炒蛋'], unit: '1 份（约 120g）', protein: 3, calories: 75, category: '蔬菜' },
  { id: 'okra', name: '秋葵', alias: ['白灼秋葵'], unit: '1 份（约 120g）', protein: 2.5, calories: 50, category: '蔬菜' },
  { id: 'bamboo-shoot', name: '竹笋', alias: ['笋', '油焖笋'], unit: '1 份（约 120g）', protein: 3, calories: 55, category: '蔬菜' },
  { id: 'fungus', name: '木耳', alias: ['黑木耳', '凉拌木耳'], unit: '1 份（约 80g）', protein: 1, calories: 40, category: '蔬菜' },
  { id: 'enoki', name: '金针菇', alias: ['金针菇肥牛'], unit: '1 份（约 100g）', protein: 2.5, calories: 40, category: '蔬菜' },
  { id: 'shiitake', name: '香菇', alias: ['香菇青菜'], unit: '1 份（约 100g）', protein: 2, calories: 45, category: '蔬菜' },

  // ── 水果 ──────────────────────────────────────────
  { id: 'apple', name: '苹果', unit: '1 个（约 200g）', protein: 0.5, calories: 100, category: '水果' },
  { id: 'banana', name: '香蕉', unit: '1 根', protein: 1.5, calories: 105, category: '水果' },
  { id: 'orange', name: '橙子', alias: ['橘子', '柑橘'], unit: '1 个', protein: 1, calories: 60, category: '水果' },
  { id: 'pear', name: '梨', alias: ['雪梨'], unit: '1 个（约 200g）', protein: 0.8, calories: 90, category: '水果' },
  { id: 'grape', name: '葡萄', alias: ['提子'], unit: '1 串（约 150g）', protein: 1, calories: 90, category: '水果' },
  { id: 'strawberry', name: '草莓', unit: '1 份（约 150g）', protein: 1.5, calories: 50, category: '水果' },
  { id: 'blueberry', name: '蓝莓', unit: '1 盒（约 125g）', protein: 1, calories: 70, category: '水果' },
  { id: 'kiwi', name: '猕猴桃', alias: ['奇异果'], unit: '1 个', protein: 1, calories: 45, category: '水果' },
  { id: 'mango', name: '芒果', unit: '1 个（约 200g）', protein: 1.5, calories: 120, category: '水果' },
  { id: 'peach', name: '桃子', alias: ['水蜜桃'], unit: '1 个（约 150g）', protein: 1, calories: 60, category: '水果' },
  { id: 'cherry-tomato', name: '圣女果', alias: ['小番茄', '千禧'], unit: '1 份（约 150g）', protein: 1.5, calories: 35, category: '水果' },
  { id: 'dragon-fruit', name: '火龙果', unit: '1 个（约 250g）', protein: 2, calories: 130, category: '水果' },
  { id: 'pomelo', name: '柚子', unit: '1 份（约 200g）', protein: 1.5, calories: 80, category: '水果' },
  { id: 'cherry', name: '樱桃', alias: ['车厘子'], unit: '1 份（约 150g）', protein: 1.5, calories: 70, category: '水果' },
  { id: 'cantaloupe', name: '哈密瓜', alias: ['甜瓜'], unit: '1 块（约 200g）', protein: 1.5, calories: 70, category: '水果' },
  { id: 'pineapple', name: '菠萝', alias: ['凤梨'], unit: '1 份（约 200g）', protein: 1, calories: 90, category: '水果' },
  { id: 'jujube', name: '冬枣', alias: ['枣'], unit: '1 份（约 100g）', protein: 1, calories: 105, category: '水果' },
  { id: 'watermelon', name: '西瓜', unit: '1 块（约 300g）', protein: 2, calories: 90, category: '水果' },

  // ── 外卖快餐 ──────────────────────────────────────
  { id: 'kungpao', name: '宫保鸡丁', alias: ['宫爆鸡丁'], unit: '1 份', protein: 22, calories: 450, category: '外卖快餐' },
  { id: 'gongbao-rice', name: '黄焖鸡米饭', alias: ['黄焖鸡'], unit: '1 份', protein: 32, calories: 780, category: '外卖快餐' },
  { id: 'beef-noodle', name: '牛肉面', alias: ['红烧牛肉面'], unit: '1 碗', protein: 22, calories: 600, category: '外卖快餐' },
  { id: 'fried-rice', name: '蛋炒饭', alias: ['扬州炒饭', '炒饭'], unit: '1 份', protein: 12, calories: 620, category: '外卖快餐' },
  { id: 'claypot-rice', name: '煲仔饭', alias: ['腊味煲仔饭'], unit: '1 份', protein: 22, calories: 720, category: '外卖快餐' },
  { id: 'malatang', name: '麻辣烫', alias: ['冒菜'], unit: '1 份', protein: 20, calories: 650, category: '外卖快餐' },
  { id: 'spicy-hot-pot', name: '麻辣香锅', unit: '1 份', protein: 25, calories: 800, category: '外卖快餐' },
  { id: 'luosifen', name: '螺蛳粉', unit: '1 份', protein: 14, calories: 550, category: '外卖快餐' },
  { id: 'hot-sour-noodle', name: '酸辣粉', unit: '1 碗', protein: 6, calories: 450, category: '外卖快餐' },
  { id: 'chongqing-noodle', name: '重庆小面', unit: '1 碗', protein: 12, calories: 520, category: '外卖快餐' },
  { id: 'shaxian', name: '沙县小吃', alias: ['沙县拌面'], unit: '1 份', protein: 15, calories: 550, category: '外卖快餐' },
  { id: 'bibimbap', name: '石锅拌饭', unit: '1 份', protein: 18, calories: 680, category: '外卖快餐' },
  { id: 'sushi', name: '寿司', unit: '1 份（8 个）', protein: 12, calories: 350, category: '外卖快餐' },
  { id: 'oden', name: '关东煮', unit: '1 份（6 串）', protein: 14, calories: 250, category: '外卖快餐' },
  { id: 'bbq', name: '烧烤', alias: ['烤串套餐'], unit: '1 份', protein: 28, calories: 700, category: '外卖快餐' },
  { id: 'hamburger', name: '汉堡', alias: ['牛肉汉堡'], unit: '1 个', protein: 15, calories: 450, category: '外卖快餐' },
  { id: 'kfc-combo', name: '炸鸡套餐', alias: ['肯德基', 'KFC'], unit: '1 份', protein: 35, calories: 900, category: '外卖快餐' },
  { id: 'mcdonalds', name: '麦当劳套餐', alias: ['金拱门'], unit: '1 份', protein: 30, calories: 850, category: '外卖快餐' },
  { id: 'pizza', name: '披萨', alias: ['比萨'], unit: '1 块', protein: 10, calories: 280, category: '外卖快餐' },
  { id: 'sandwich', name: '三明治', unit: '1 个', protein: 14, calories: 320, category: '外卖快餐' },
  { id: 'jianbing', name: '煎饼果子', unit: '1 个', protein: 12, calories: 450, category: '外卖快餐' },
  { id: 'roujiamo', name: '肉夹馍', unit: '1 个', protein: 14, calories: 480, category: '外卖快餐' },

  // ── 零食饮料 ──────────────────────────────────────
  { id: 'protein-bar', name: '蛋白棒', unit: '1 根', protein: 15, calories: 200, category: '零食饮料' },
  { id: 'nuts', name: '坚果', alias: ['混合坚果', '杏仁', '腰果', '核桃'], unit: '1 小包（25g）', protein: 5, calories: 150, category: '零食饮料' },
  { id: 'milk-tea', name: '奶茶', unit: '1 杯（500ml）', protein: 6, calories: 450, category: '零食饮料' },
  { id: 'latte', name: '拿铁', alias: ['咖啡拿铁'], unit: '1 杯（350ml）', protein: 8, calories: 180, category: '零食饮料' },
  { id: 'black-coffee', name: '黑咖啡', alias: ['美式'], unit: '1 杯（300ml）', protein: 0.5, calories: 10, category: '零食饮料' },
  { id: 'cola', name: '可乐', alias: ['雪碧', '汽水'], unit: '1 罐（330ml）', protein: 0, calories: 140, category: '零食饮料' },
  { id: 'juice', name: '果汁', alias: ['橙汁'], unit: '1 瓶（500ml）', protein: 1, calories: 220, category: '零食饮料' },
  { id: 'sports-drink', name: '运动饮料', alias: ['宝矿力', '佳得乐'], unit: '1 瓶（500ml）', protein: 0, calories: 130, category: '零食饮料' },
  { id: 'soy-drink', name: '豆奶', alias: ['维他奶'], unit: '1 盒（250ml）', protein: 6, calories: 130, category: '零食饮料' },
  { id: 'chocolate', name: '巧克力', unit: '1 块（30g）', protein: 2, calories: 160, category: '零食饮料' },
  { id: 'chips', name: '薯片', unit: '1 包（70g）', protein: 4, calories: 380, category: '零食饮料' },
  { id: 'cake', name: '蛋糕', alias: ['奶油蛋糕'], unit: '1 块（100g）', protein: 6, calories: 350, category: '零食饮料' },
  { id: 'ice-cream', name: '冰淇淋', alias: ['雪糕'], unit: '1 个', protein: 3, calories: 200, category: '零食饮料' },
  { id: 'mooncake', name: '月饼', unit: '1 个（80g）', protein: 5, calories: 350, category: '零食饮料' },
  { id: 'jelly', name: '果冻', unit: '1 个', protein: 0, calories: 60, category: '零食饮料' },
  { id: 'spicy-strip', name: '辣条', unit: '1 包（60g）', protein: 5, calories: 300, category: '零食饮料' },
  { id: 'instant-noodle', name: '泡面', alias: ['方便面', '康师傅'], unit: '1 桶', protein: 9, calories: 470, category: '零食饮料' },
  { id: 'beer', name: '啤酒', unit: '1 罐（330ml）', protein: 1, calories: 140, category: '零食饮料' },

  // ── 补剂 ──────────────────────────────────────────
  { id: 'whey', name: '乳清蛋白粉', alias: ['蛋白粉', 'whey'], unit: '1 勺（30g）', protein: 24, calories: 120, category: '补剂' },
  { id: 'casein', name: '酪蛋白', alias: ['缓释蛋白'], unit: '1 勺（30g）', protein: 24, calories: 115, category: '补剂' },
  { id: 'mass-gainer', name: '增肌粉', unit: '1 勺（50g）', protein: 15, calories: 200, category: '补剂' },
  { id: 'creatine', name: '肌酸', unit: '1 勺（5g）', protein: 0, calories: 0, category: '补剂' },
  { id: 'bcaa', name: 'BCAA', alias: ['支链氨基酸'], unit: '1 勺（10g）', protein: 5, calories: 40, category: '补剂' },
  { id: 'pre-workout', name: '氮泵', unit: '1 勺（10g）', protein: 0, calories: 20, category: '补剂' },
  { id: 'electrolyte', name: '电解质', alias: ['电解质粉'], unit: '1 包', protein: 0, calories: 10, category: '补剂' },
  { id: 'fish-oil', name: '鱼油', alias: ['Omega3'], unit: '1 粒', protein: 0, calories: 10, category: '补剂' },
  { id: 'multivitamin', name: '复合维生素', alias: ['维生素'], unit: '1 粒', protein: 0, calories: 0, category: '补剂' },
  { id: 'boiled-egg-x3', name: '水煮蛋 3 个', unit: '3 个', protein: 19.5, calories: 225, category: '补剂' },
];

// ── 套餐模板：食堂常吃的组合，一键记账 ────────────────────
const TEMPLATES = [
  { id: 'tpl-breakfast', name: '早餐组合', meal: '早餐', items: ['egg', 'milk', 'mantou'] },
  { id: 'tpl-breakfast-2', name: '清淡早餐', meal: '早餐', items: ['congee', 'tea-egg', 'soymilk'] },
  { id: 'tpl-breakfast-3', name: '增肌早餐', meal: '早餐', items: ['egg', 'oats', 'milk', 'banana'] },
  { id: 'tpl-canteen-lunch', name: '食堂标准午餐', meal: '午餐', items: ['rice', 'chicken-leg', 'greens'] },
  { id: 'tpl-canteen-dinner', name: '食堂标准晚餐', meal: '晚餐', items: ['rice-2', 'lion-head', 'cauliflower', 'greens'] },
  { id: 'tpl-high-protein-lunch', name: '高蛋白午餐', meal: '午餐', items: ['brown-rice', 'chicken-breast', 'broccoli', 'egg'] },
  { id: 'tpl-light-dinner', name: '减脂晚餐', meal: '晚餐', items: ['sweet-potato', 'shrimp', 'lettuce'] },
  { id: 'tpl-gym-post', name: '练后加餐', meal: '加餐', items: ['whey', 'banana'] },
  { id: 'tpl-highprotein', name: '高蛋白日（补差）', meal: '加餐', items: ['whey', 'egg', 'milk'] },
  { id: 'tpl-takeout', name: '黄焖鸡外卖', meal: '午餐', items: ['gongbao-rice'] },
  { id: 'tpl-noodle', name: '面食一顿', meal: '午餐', items: ['beef-noodle', 'greens'] },
];

const foodById = (id) => FOODS.find((f) => f.id === id);

/** 按名称/别名查找食物 */
function findFoods(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return FOODS.filter(
    (f) => f.name.toLowerCase().includes(q) || (f.alias || []).some((a) => a.toLowerCase().includes(q))
  );
}

/** 量词：出现在数字与食物名之间，或被放在食物名之后 */
const UNIT = '个|份|碗|杯|根|块|片|包|勺|两|只|条|盒|瓶|盘|袋|颗|串';

/**
 * 把一段描述拆成可能的食物词（用于「粘贴识别」）。
 * 空格也当分隔符（「牛奶一盒 鸡蛋一个」要拆成两项），
 * 但「2 个鸡蛋」这种「数字 + 空格 + 量词」不能拆 —— 拆了数字就丢了份数，
 * 所以先把「数字 空格 量词」之间的空格吃掉再切分。
 */
function tokenize(text) {
  const glued = String(text || '').replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s+(?=(?:${UNIT}))`, 'g'), '$1');
  const out = [];
  const segs = glued
    // 分隔符：中英文标点、斜杠、换行
    .split(/[+＋、,，;；/\n\r\t]|(?:\s+和\s+)|(?:\s*配\s*)/);
  for (const seg of segs) {
    // 再用空格拆一次：像「牛奶一盒 鸡蛋一个」这种空格分隔的多项也要分开，
    // 否则整串会当成一个 token，只有第一个食物被识别到。
    for (const piece of seg.split(/\s+/)) {
      const s = piece.trim();
      if (s.length > 0 && s.length <= 20) out.push(s);
    }
  }
  return out;
}

const CN_NUM = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/**
 * 重量单位（g/克/ml/毫升…）不是「份数」。
 * 「牛肉100g」如果按份数解析会变成 100 份 = 2000g 蛋白，必须单独挡掉。
 * 这里把它当「1 份」处理，并在 UI 里提示用户按份量点选更准。
 *
 * 注意：数字在名字后面才匹配（`牛肉100g`），所以用 `(.*?)` 吃掉前缀。
 */
const WEIGHT_UNIT = /^(.*?)\s*(\d+(?:\.\d+)?)\s*(g|G|克|kg|KG|千克|ml|ML|毫升|斤)$/;

/**
 * 从单个 token 里拆出「份数」和「食物名」。
 * 支持的写法：
 *   - 数字在前：`2个鸡蛋`、`3个鸡腿`、`1.5碗米饭`
 *   - 中文数字在前：`两个鸡蛋`、`三片奶酪`
 *   - 量词后置：`苹果一个`、`鸡蛋两个`、`米饭二两`
 *   - 数字在中间：`苹果2个`、`牛奶1盒`
 */
function parseQty(token) {
  // ⓪ 重量写法：不当作份数（「牛肉100g」→ 1 份 + 提示）
  const w = token.match(WEIGHT_UNIT);
  if (w && w[1].trim()) {
    return { qty: 1, namePart: w[1].trim(), approx: `${w[2]}${w[3]}` };
  }

  // ① 数字在前：「2 个鸡蛋」「3个鸡腿」「1.5 碗米饭」
  const lead = token.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(?:${UNIT})?\\s*(.+)$`));
  if (lead) {
    const rest = lead[2].trim();
    if (rest) return { qty: Number(lead[1]), namePart: rest };
  }
  const leadCn = token.match(new RegExp(`^([一二两三四五六七八九十])\\s*(?:${UNIT})?\\s*(.+)$`));
  if (leadCn && CN_NUM[leadCn[1]] && leadCn[2].trim()) {
    return { qty: CN_NUM[leadCn[1]], namePart: leadCn[2].trim() };
  }

  // ② 量词后置：「苹果一个」「鸡蛋两个」「米饭二两」
  //    注意「米饭二两」这种既是名字又是份量的写法：先尝试整体匹配食物库，
  //    匹配不上才按「食物名 + 份量」拆开。
  const trail = token.match(new RegExp(`^(.+?)\\s*([一二两三四五六七八九十]|\\d+(?:\\.\\d+)?)\\s*(?:${UNIT})$`));
  if (trail) {
    const head = trail[1].trim();
    const numRaw = trail[2];
    const qty = /^\d/.test(numRaw) ? Number(numRaw) : CN_NUM[numRaw];
    if (head && qty) return { qty, namePart: head };
  }

  // ③ 乘号写法：「鸡腿x2」「鸡蛋×2」「牛奶*2」——没有量词，靠 x/×/* 认出来
  const times = token.match(/^(.+?)\s*[xX×*]\s*(\d+(?:\.\d+)?)$/);
  if (times) {
    const head = times[1].trim();
    const qty = Number(times[2]);
    if (head && qty > 0) return { qty, namePart: head };
  }

  // ④ 数字夹在中间、量词在尾：「苹果2个」「牛奶1盒」
  //    注意必须在 ② 之后再判：否则「米饭二两」会被这里先截成「米饭」×2，
  //    而食物库里的「米饭（二两）」才是更准的条目。
  const mid = token.match(new RegExp(`^(.+?)\\s*(\\d+(?:\\.\\d+)?)\\s*(?:${UNIT})$`));
  if (mid) {
    const head = mid[1].trim();
    const qty = Number(mid[2]);
    if (head && qty > 0) return { qty, namePart: head };
  }

  return { qty: 1, namePart: token };
}

/**
 * 从自然语言描述中识别食物并估算营养。
 * 支持「2 个鸡蛋」「米饭二两」「苹果2个」「3 个鸡腿」这类份数写法。
 */
function analyzeText(text) {
  const tokens = tokenize(text);
  const matches = [];

  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;

    // 先整体匹配：像「米饭二两」这种食物库里就有现成条目的，不要拆成「米饭 ×2」
    let food = FOODS.find((f) => f.name === token || (f.alias || []).includes(token));
    let qty = 1;
    let approx;

    if (!food) {
      const parsed = parseQty(token);
      qty = parsed.qty;
      approx = parsed.approx;
      const namePart = parsed.namePart;

      // 精确匹配，再模糊匹配
      food = FOODS.find((f) => f.name === namePart || (f.alias || []).includes(namePart));
      if (!food) {
        const cands = findFoods(namePart);
        // 取名字最长的（最具体）那个，避免「米饭」抢走「蛋炒饭」
        food = cands.sort((a, b) => b.name.length - a.name.length)[0];
      }
      if (!food) {
        // 反向：token 包含食物名
        food = FOODS.filter(
          (f) => token.includes(f.name) || (f.alias || []).some((a) => token.includes(a))
        ).sort((a, b) => b.name.length - a.name.length)[0];
      }
      // 反向命中时，份数应按匹配到的名字重新解析（如「2个水煮蛋」→ 鸡蛋）
      if (food && qty === 1 && namePart === token) {
        const inner = parseQty(token.replace(food.name, '').trim() || token);
        if (inner.qty > 1 && !inner.approx) qty = inner.qty;
      }
    }

    if (food) {
      const m = {
        token,
        food,
        qty,
        protein: Math.round(food.protein * qty * 10) / 10,
        calories: Math.round(food.calories * qty),
      };
      if (approx) m.approx = approx;
      matches.push(m);
    } else {
      const m = { token, qty, protein: 0, calories: 0 };
      if (approx) m.approx = approx;
      matches.push(m);
    }
  }

  return {
    matches,
    totalProtein: Math.round(matches.reduce((s, m) => s + m.protein, 0)),
    totalCalories: Math.round(matches.reduce((s, m) => s + m.calories, 0)),
  };
}

module.exports = {
  PROTEIN_TARGET,
  CALORIE_TARGET,
  proteinTargetFor,
  CATEGORIES,
  FOODS,
  TEMPLATES,
  foodById,
  findFoods,
  tokenize,
  parseQty,
  analyzeText,
};

