/**
 * 生成3份对比文件PDF（各20页以上）
 * 用法: node scripts/generate-comparison-pdfs.js
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const FONT = '/Library/Fonts/Arial Unicode.ttf';
const BASE = path.join(__dirname, '..', 'samples', '02-对比文件');

function createDoc(outputPath, title, author) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 72, bottom: 72, left: 72, right: 72 },
    info: { Title: title, Author: author }
  });
  doc.registerFont('CJK', FONT);
  doc.pipe(fs.createWriteStream(outputPath));
  return doc;
}

function heading(doc, text, size = 16) {
  doc.font('CJK').fontSize(size).text(text, { align: 'center', paragraphGap: 12 });
}

function para(doc, text, indent = true) {
  doc.font('CJK').fontSize(11).text(text, {
    align: 'justify',
    indent: indent ? 24 : 0,
    lineGap: 4,
    paragraphGap: 6,
  });
}

function claim(doc, text) {
  doc.font('CJK').fontSize(11).text(text, {
    align: 'justify',
    indent: 24,
    lineGap: 4,
    paragraphGap: 8,
  });
}

// ============================================================
// D1: CN108XXXXXXA - 铝合金散热器
// ============================================================
function generateD1() {
  const doc = createDoc(
    path.join(BASE, 'CN108XXXXXXA-散热器.pdf'),
    '一种散热器',
    '申请人'
  );

  // 封面
  doc.moveDown(8);
  heading(doc, '实 用 新 型 专 利 申 请 书', 26);
  doc.moveDown(2);
  heading(doc, '一种散热器', 20);
  doc.moveDown(4);
  [
    ['申请号', 'CN108XXXXXXA'],
    ['申请日', '2021年12月10日'],
    ['授权公告日', '2022年06月15日'],
    ['申请人', '东莞市恒通散热科技有限公司'],
    ['地址', '广东省东莞市长安镇乌沙社区兴发路168号'],
    ['发明人', '刘建国  陈伟明'],
  ].forEach(([l, v]) => {
    doc.font('CJK').fontSize(12).text(`${l}：${v}`, { align: 'left', indent: 48, lineGap: 6 });
  });
  doc.moveDown(6);
  doc.font('CJK').fontSize(10).text('权利要求书  共6项', { align: 'center', lineGap: 2 });
  doc.text('说明书  共19页', { align: 'center', lineGap: 2 });
  doc.text('说明书附图  共4幅', { align: 'center', lineGap: 2 });
  doc.text('说明书摘要  共1页', { align: 'center' });

  doc.addPage();

  // 权利要求书
  heading(doc, '权 利 要 求 书', 18);
  doc.moveDown(1);
  claim(doc, '1. 一种散热器，其特征在于，包括：\n铝合金基板，所述基板为矩形板状结构，厚度为3-6mm；\n散热翅片，数量为6-16片，所述散热翅片为铜质翅片，通过焊接方式与所述基板的上表面连接；\n安装区域，设置在所述基板的下表面中央位置，用于安装发热元件。');
  claim(doc, '2. 根据权利要求1所述的散热器，其特征在于，所述散热翅片的材质为紫铜或黄铜，翅片厚度为1.0-2.5mm，翅片高度为10-30mm，翅片间距为3-8mm。');
  claim(doc, '3. 根据权利要求1所述的散热器，其特征在于，所述散热翅片与所述基板之间通过锡基焊料焊接连接，焊接温度为220-260°C。');
  claim(doc, '4. 根据权利要求1所述的散热器，其特征在于，所述基板的材质为6063-T5铝合金，导热系数不低于180W/(m·K)。');
  claim(doc, '5. 根据权利要求1所述的散热器，其特征在于，所述基板上表面设置有与所述散热翅片数量对应的安装槽，所述散热翅片嵌入所述安装槽内并通过焊接固定。');
  claim(doc, '6. 根据权利要求1至5任一项所述的散热器，其特征在于，所述安装区域涂覆有导热硅脂层，厚度为0.05-0.2mm，热导率不低于3W/(m·K)。');

  doc.addPage();

  // 说明书
  heading(doc, '说  明  书', 18);
  doc.moveDown(1);
  heading(doc, '一种散热器', 14);
  doc.moveDown(1);

  heading(doc, '【技术领域】', 13);
  para(doc, '[0001] 本实用新型涉及散热器技术领域，具体涉及一种用于电子元器件散热的散热器。更特别地，本实用新型涉及一种采用铝合金基板和铜质散热翅片的组合式散热器，适用于大功率LED灯具、功率半导体模块、电源模块等发热电子元器件的散热。');

  heading(doc, '【背景技术】', 13);
  para(doc, '[0002] 随着电子技术的快速发展，电子元器件的功率密度不断提高，发热量也随之增大。以大功率LED为例，单颗LED芯片的输入功率可达数十瓦，电光转换效率仅为30%-40%，其余电能以热量形式散失。如果热量不能及时散出，将导致芯片结温升高，性能下降，寿命缩短。');
  para(doc, '[0003] 散热器是电子元器件散热系统中最常用的被动散热元件。散热器通过增大散热面积和利用空气自然对流或强制对流将热量带走，降低发热元件的工作温度。散热器的性能直接影响电子元器件的可靠性和使用寿命。');
  para(doc, '[0004] 现有技术中，散热器的常见结构包括铝合金压铸散热器、铝挤型散热器和铜铝组合散热器。铝合金压铸散热器成本低、加工方便，但铝合金的导热系数（约200W/(m·K)）相对较低，在高功率密度应用中散热能力受限。铝挤型散热器的翅片与基板为一体结构，不存在界面热阻，但翅片形状受限于挤型模具。铜铝组合散热器利用铜的高导热系数（约400W/(m·K)）提高散热效率，但铜铝之间存在焊接界面热阻。');
  para(doc, '[0005] 中国专利申请CN107XXXXXXA公开了一种铝挤型散热器，采用6063铝合金一体挤型成型，翅片与基板无界面热阻，但翅片高度和间距受限于挤型工艺，散热面积有限。');
  para(doc, '[0006] 中国专利申请CN106XXXXXXB公开了一种铜铝复合散热器，将铜板焊接在铝合金基板上以提高导热性，但铜铝异种金属焊接工艺复杂，焊接界面热阻较大，且铜铝之间存在电偶腐蚀风险。');
  para(doc, '[0007] 因此，需要一种散热效率高、结构简单、制造成本低、可靠性好的散热器。');

  heading(doc, '【实用新型内容】', 13);
  para(doc, '[0008] 针对现有技术中存在的上述技术问题，本实用新型的目的在于提供一种散热器，该散热器采用铝合金基板和铜质散热翅片的组合结构，通过焊接方式连接，兼顾散热效率和制造成本。');
  para(doc, '[0009] 为实现上述目的，本实用新型采用如下技术方案：');
  para(doc, '[0010] 一种散热器，包括铝合金基板、铜质散热翅片和安装区域。');
  para(doc, '[0011] 所述铝合金基板为矩形板状结构，厚度为3-6mm，材质为6063-T5铝合金，导热系数不低于180W/(m·K)。基板上表面设置有与散热翅片数量对应的安装槽，安装槽深度为1-2mm，宽度与翅片厚度匹配。');
  para(doc, '[0012] 所述散热翅片数量为6-16片，材质为紫铜或黄铜，翅片厚度为1.0-2.5mm，翅片高度为10-30mm，翅片间距为3-8mm。散热翅片嵌入基板上表面的安装槽内，通过锡基焊料焊接固定。');
  para(doc, '[0013] 所述安装区域设置在基板下表面中央位置，面积为发热元件投影面积的1.2-1.5倍。安装区域涂覆有导热硅脂层，用于降低发热元件与基板之间的接触热阻。');
  para(doc, '[0014] 进一步地，所述散热翅片的表面经过阳极氧化处理，形成厚度为10-20μm的氧化膜，提高耐腐蚀性和表面辐射率。');
  para(doc, '[0015] 进一步地，所述散热翅片的形状为平板翅片、波纹翅片或百叶窗翅片中的一种。');
  para(doc, '[0016] 进一步地，所述基板的四个角部设置有安装孔，用于将散热器固定在灯具外壳或电路板上。');
  para(doc, '[0017] 本实用新型的有益效果：');
  para(doc, '[0018] （1）采用铝合金基板和铜质散热翅片的组合结构，铝合金基板成本低、加工性好，铜质翅片导热系数高，兼顾散热效率和制造成本。');
  para(doc, '[0019] （2）散热翅片通过焊接方式与基板连接，焊接工艺成熟可靠，连接强度高，界面热阻可通过优化焊接工艺控制在较低水平。');
  para(doc, '[0020] （3）基板上表面设置安装槽，增大了翅片与基板的接触面积，降低了焊接界面热阻，同时提高了翅片的定位精度和连接可靠性。');
  para(doc, '[0021] （4）散热翅片表面经阳极氧化处理，提高了耐腐蚀性和表面辐射率，有利于辐射散热，延长了散热器的使用寿命。');

  doc.addPage();

  heading(doc, '【附图说明】', 13);
  para(doc, '[0022] 图1为本实用新型提供的散热器的整体结构立体示意图。');
  para(doc, '[0023] 图2为本实用新型提供的散热器的纵向剖面结构示意图。');
  para(doc, '[0024] 图3为本实用新型提供的散热器的俯视结构示意图，示出散热翅片的分布。');
  para(doc, '[0025] 图4为本实用新型提供的散热器中散热翅片与基板焊接部位的放大示意图。');
  para(doc, '[0026] 附图标记说明：1-铝合金基板；2-散热翅片；3-安装区域；4-安装槽；5-焊接层；6-安装孔；7-导热硅脂层。');

  doc.addPage();

  heading(doc, '【具体实施方式】', 13);
  para(doc, '[0027] 下面结合附图和实施例对本实用新型作进一步详细说明。');
  para(doc, '[0028] 实施例1：');
  para(doc, '[0029] 参照图1至图4，本实施例提供一种散热器，包括铝合金基板1、铜质散热翅片2和安装区域3。');
  para(doc, '[0030] 铝合金基板1采用6063-T5铝合金，外形尺寸为120mm×120mm×4mm。基板上表面沿长度方向设置10条平行安装槽4，安装槽截面为矩形，宽度1.8mm，深度1.5mm，间距10mm。基板下表面中央区域（80mm×80mm）为安装区域3。基板四个角部各有一个直径4mm的安装孔6。');
  para(doc, '[0031] 散热翅片2共10片，材质为紫铜T2，每片尺寸为120mm×1.5mm×25mm（长×厚×高）。翅片底部嵌入基板的安装槽4内，通过锡基焊料（Sn96.5Ag3Cu0.5，熔点217-220°C）焊接固定。焊接工艺：在安装槽内预涂焊锡膏，将翅片插入安装槽，在回流焊炉中加热至240°C，保温30秒后冷却。');
  para(doc, '[0032] 焊接完成后，焊接层5厚度约0.1mm，焊锡填充率>95%，翅片与基板之间的焊接界面热阻约为0.05°C·cm²/W。');
  para(doc, '[0033] 散热翅片2的表面经阳极氧化处理，氧化膜厚度15μm，颜色为黑色，表面发射率从0.03（裸铜）提高到0.88。');
  para(doc, '[0034] 安装区域3涂覆导热硅脂层7，材质为含氧化铝填料的硅脂，热导率5W/(m·K)，涂覆厚度0.1mm。');
  para(doc, '[0035] 经测试，本实施例的散热器在安装50W大功率LED模组（4颗Cree XHP70.2芯片）连续工作2小时后，LED芯片结温为90°C，散热器基板下表面最高温度为72°C，翅片顶部温度为58°C。散热器总重量为450g，制造成本约30元。');

  doc.addPage();

  para(doc, '[0036] 实施例2：');
  para(doc, '[0037] 与实施例1的区别在于：');
  para(doc, '[0038] （1）散热翅片2数量增至16片，厚度减至1.0mm，间距减至5mm，高度增至30mm。散热翅片总面积从实施例1的6000mm²增至9600mm²，增加60%。');
  para(doc, '[0039] （2）基板1厚度增至5mm，安装槽深度增至2mm，以容纳更薄的翅片并保证焊接强度。');
  para(doc, '[0040] （3）散热翅片形状改为波纹翅片，波纹高度3mm，波纹间距10mm。波纹翅片增大了散热面积，同时增强了空气扰动，提高了对流换热系数。');
  para(doc, '[0041] 经测试，本实施例的散热器在50W连续工作2小时后，LED芯片结温为85°C，较实施例1降低5°C，但重量增至520g，成本增至38元。');

  para(doc, '[0042] 实施例3：');
  para(doc, '[0043] 与实施例1的区别在于：');
  para(doc, '[0044] （1）散热翅片2材质改为黄铜H62，导热系数109W/(m·K)，较紫铜（390W/(m·K)）低，但成本降低约40%。');
  para(doc, '[0045] （2）焊接工艺改为浸锡焊接，将组装好的散热器浸入熔融锡槽（温度260°C，浸入时间5秒），焊接效率高，适合大批量生产。');
  para(doc, '[0046] 经测试，本实施例的散热器在50W连续工作2小时后，LED芯片结温为93°C，较实施例1（90°C）高出3°C，但制造成本降至22元，降低了27%。');

  para(doc, '[0047] 实施例4：小功率LED散热器');
  para(doc, '[0048] 本实施例针对小功率LED应用（10W），散热器尺寸缩小。');
  para(doc, '[0049] 基板1尺寸为60mm×60mm×3mm，散热翅片6片，材质紫铜，厚度1.2mm，高度15mm，间距6mm。安装区域30mm×30mm。');
  para(doc, '[0050] 经测试，本实施例的散热器在10W连续工作2小时后，LED芯片结温为70°C，散热器总重量120g，成本约12元。');

  doc.addPage();

  para(doc, '[0051] 对比例1：纯铝合金散热器');
  para(doc, '[0052] 对比例1采用与实施例1相同外形尺寸（120mm×120mm×4mm基板）的纯铝合金散热器，散热翅片为铝合金6063，通过铝挤型一体成型，翅片数量10片，高度25mm，厚度1.5mm。');
  para(doc, '[0053] 经测试，对比例1在50W连续工作2小时后，LED芯片结温为95°C，较实施例1（90°C）高出5°C。原因是铝合金导热系数（180W/(m·K)）低于紫铜（390W/(m·K)），翅片的轴向热阻较大，翅片效率较低。但对比例1的重量（380g）较实施例1（450g）轻16%，成本（20元）较实施例1（30元）低33%。');

  para(doc, '[0054] 对比例2：铜铝复合散热器（铜板+铝翅片）');
  para(doc, '[0055] 对比例2采用2mm厚紫铜板焊接在4mm厚铝合金基板上，铜板上设置铝合金翅片（铝挤型成型）。铜板与铝板之间通过锡焊连接。');
  para(doc, '[0056] 经测试，对比例2在50W连续工作2小时后，LED芯片结温为88°C，略优于实施例1（90°C）。但铜板与铝板之间的焊接界面热阻（约0.1°C·cm²/W）影响了热量传导，且铜铝异种金属在潮湿环境中存在电偶腐蚀风险，长期可靠性不如实施例1。');

  doc.addPage();

  para(doc, '[0057] 表1 各实施例和对比例的性能对比');
  doc.font('CJK').fontSize(10);
  const t1 = [
    ['项目', '实施例1', '实施例2', '实施例3', '实施例4', '对比例1', '对比例2'],
    ['基板材质', '6063铝', '6063铝', '6063铝', '6063铝', '6063铝', '铜+铝'],
    ['翅片材质', '紫铜', '紫铜', '黄铜', '紫铜', '铝合金', '铝合金'],
    ['翅片数量', '10', '16', '10', '6', '10', '10'],
    ['翅片高度(mm)', '25', '30', '25', '15', '25', '25'],
    ['50W结温(°C)', '90', '85', '93', '-', '95', '88'],
    ['10W结温(°C)', '-', '-', '-', '70', '-', '-'],
    ['重量(g)', '450', '520', '410', '120', '380', '480'],
    ['成本(元)', '30', '38', '22', '12', '20', '35'],
  ];
  const colW = 451.28 / t1[0].length;
  let sy = doc.y;
  t1.forEach((row, ri) => {
    const rowH = 20;
    if (sy + rowH > 769.89) { doc.addPage(); sy = 72; }
    row.forEach((cell, ci) => {
      const x = 72 + ci * colW;
      doc.rect(x, sy, colW, rowH).stroke();
      doc.font('CJK').fontSize(9).text(cell, x + 2, sy + 4, { width: colW - 4, align: 'center', lineBreak: false });
    });
    sy += rowH;
  });
  doc.y = sy + 12;

  doc.addPage();

  para(doc, '[0058] 散热翅片焊接工艺优化说明：');
  para(doc, '[0059] 本实用新型的散热翅片与基板之间的焊接质量直接影响散热性能。焊接界面热阻是铜铝组合散热器的关键热阻之一。');
  para(doc, '[0060] 影响焊接界面热阻的因素包括：（1）焊料种类：锡银铜无铅焊料（导热系数约50W/(m·K)）优于锡铅焊料（导热系数约35W/(m·K)）；（2）焊接层厚度：焊接层越薄，热阻越小，但过薄会导致焊接不牢靠，推荐厚度0.05-0.2mm；（3）焊锡填充率：填充率越高，有效导热面积越大，热阻越小，推荐填充率>90%；（4）焊接温度和时间：温度过低导致焊锡流动性差，温度过高导致基板变形，推荐240°C、30秒。');
  para(doc, '[0061] 经过工艺优化，本实施例1的焊接界面热阻可控制在0.03-0.05°C·cm²/W，远低于铜铝异种金属直接接触的热阻（约0.5-1.0°C·cm²/W）。');

  para(doc, '[0062] 安装槽设计说明：');
  para(doc, '[0063] 基板上表面的安装槽4的作用有三：（1）增大翅片与基板的接触面积，安装槽深度1.5mm意味着翅片嵌入基板1.5mm，接触面积增加了两侧面的面积（2×1.5mm×120mm=360mm²/片），10片翅片共增加3600mm²，使总焊接面积从实施例1的底部面积（1.5mm×120mm×10=1800mm²）增至5400mm²，增加了200%；（2）提高翅片的定位精度，翅片在安装槽内自动对中，避免焊接过程中翅片偏移；（3）提高焊接强度，安装槽提供了侧面约束，增强了翅片的抗弯和抗扭能力。');

  para(doc, '[0064] 表面处理说明：');
  para(doc, '[0065] 散热翅片表面阳极氧化处理工艺：散热翅片（紫铜T2）先经酸洗（10%硫酸溶液，室温，1分钟）去除表面氧化层，然后在铬酸电解液中进行阳极氧化处理（电压5V，温度30°C，时间20分钟），生成厚度约15μm的Cu₂O氧化膜。氧化膜呈黑色，表面发射率从0.03（裸铜）提高到0.88，辐射散热量提高约29倍。');
  para(doc, '[0066] 阳极氧化膜还具有良好的绝缘性（绝缘电阻>10MΩ）和耐腐蚀性（耐盐雾试验200小时），可防止铜翅片在潮湿环境中氧化变色。');

  doc.addPage();

  para(doc, '[0067] 可靠性测试：');
  para(doc, '[0068] 对实施例1的散热器进行了以下可靠性测试：');
  para(doc, '[0069] （1）热循环测试：在-40°C至85°C温度范围内进行500次热循环。测试后检查焊接部位无开裂，翅片无脱落，散热性能无衰减。');
  para(doc, '[0070] （2）高温老化测试：在85°C环境温度下连续放置1000小时。测试后检查阳极氧化层无变色、无剥落，焊接部位无腐蚀。');
  para(doc, '[0071] （3）湿热老化测试：在85°C/85%RH条件下连续放置500小时。测试后检查铜翅片无明显氧化变色，焊接部位无腐蚀。');
  para(doc, '[0072] （4）振动测试：在10-500Hz频率范围内进行随机振动测试，加速度2Grms，三个方向各振动1小时。测试后检查翅片无松动、无脱落。');

  doc.addPage();

  para(doc, '[0073] 热设计计算：');
  para(doc, '[0074] 对实施例1的散热器进行热设计计算，验证设计方案的合理性。');
  para(doc, '[0075] 设计输入条件：LED总功率P=50W，电光转换效率η=35%，环境温度Ta=25°C，LED芯片最高允许结温Tj_max=120°C，目标结温Tj_target≤90°C。');
  para(doc, '[0076] LED芯片发热量：Q=P×(1-η)=50×(1-0.35)=32.5W。');
  para(doc, '[0077] 散热系统的总热阻Rja=(Tj-Ta)/Q=(90-25)/32.5=2.0°C/W。');
  para(doc, '[0078] 热阻构成分析：Rja=Rjc+Rcs+Rsa。其中Rjc为LED芯片到基板的热阻（包括焊接层和基板热阻），Rcs为基板到散热器的热阻（导热硅脂层），Rsa为散热器到环境空气的热阻。');
  para(doc, '[0079] Rjc计算：LED芯片通过导热硅脂（热导率5W/(m·K)，厚度0.1mm）连接至铝合金基板。Rjc=0.01cm÷5W/(m·K)÷(8cm)²=0.003°C/W。加上基板自身热阻（4mm厚铝合金，导热系数180W/(m·K)），Rjc≈0.15°C/W。');
  para(doc, '[0080] Rcs计算：焊接界面热阻约为0.05°C·cm²/W，有效导热面积约54cm²（含安装槽侧面），Rcs=0.05÷54≈0.001°C/W。');
  para(doc, '[0081] Rsa计算：散热翅片自然对流散热。翅片总散热面积约6000mm²（10片×2面×120mm×25mm），加上基板外表面面积约8640mm²，总散热面积约14640mm²。自然对流换热系数h≈8W/(m²·K)。Rsa=1/(h×A)=1/(8×0.1464)≈0.85°C/W。');
  para(doc, '[0082] 总热阻Rja=0.15+0.001+0.85=1.0°C/W。设计结温Tj=Ta+Q×Rja=25+32.5×1.0=57.5°C。该值远低于目标结温90°C，留有充足的热设计余量。实测结温90°C高于计算值，主要是因为自然对流换热系数取值偏高以及翅片间空气流动受阻。');

  doc.addPage();

  para(doc, '[0083] 翅片效率计算：');
  para(doc, '[0084] 散热翅片的效率ηf定义为翅片实际散热量与翅片理想散热量（翅片各处温度均等于基板温度）之比。对于等截面矩形直翅片，翅片效率为：');
  para(doc, '[0085] ηf = tanh(mL)/(mL)');
  para(doc, '[0086] 其中m=√(2h/(kδ))，h为对流换热系数（8W/(m²·K)），k为翅片材料导热系数（紫铜390W/(m·K)），δ为翅片厚度（1.5mm），L为翅片高度（25mm）。');
  para(doc, '[0087] m=√(2×8/(390×0.0015))=√(27.35)=5.23m^(-1)');
  para(doc, '[0088] mL=5.23×0.025=0.131');
  para(doc, '[0089] ηf=tanh(0.131)/0.131=0.130/0.131=0.992=99.2%');
  para(doc, '[0090] 翅片效率高达99.2%，说明紫铜翅片的导热系数足够高，翅片高度25mm在自然对流条件下不会导致明显的翅片顶部温度下降。翅片几乎全部面积都有效参与散热。');
  para(doc, '[0091] 作为对比，如果翅片材质改为铝合金（导热系数180W/(m·K)），m=√(2×8/(180×0.0015))=7.70m^(-1)，mL=0.193，ηf=tanh(0.193)/0.193=0.191/0.193=0.990=99.0%。铝合金翅片效率仅比紫铜低0.2%，说明在25mm翅片高度下，材质对翅片效率的影响很小。但在更高翅片（如50mm）或更薄翅片（如0.5mm）条件下，材质差异会更显著。');

  doc.addPage();

  para(doc, '[0092] 应用场景说明：');
  para(doc, '[0093] 本实用新型的散热器可广泛应用于以下场景：');
  para(doc, '[0094] （1）室内LED照明：LED筒灯、面板灯、工矿灯等，功率范围30-200W。铝合金基板成本低，铜质翅片散热效率高，适合大批量商用照明灯具。');
  para(doc, '[0095] （2）功率半导体散热：IGBT模块、MOSFET模块等功率器件的散热。散热器的安装区域可根据功率器件的封装尺寸定制。');
  para(doc, '[0096] （3）电源模块散热：开关电源、DC-DC变换器等电源模块的散热。散热器的安装孔设计便于固定在电源外壳上。');
  para(doc, '[0097] （4）通信设备散热：基站功放模块、光模块等通信设备的散热。散热器的表面阳极氧化处理提供了良好的耐腐蚀性，适合通信基站的户外环境。');
  para(doc, '[0098] （5）LED车灯散热：汽车前大灯、日间行车灯等。散热器的结构紧凑，适合车灯内部有限的安装空间。铜质翅片的高导热系数确保在高温环境下仍能有效散热。');

  para(doc, '[0099] 发明人声明：');
  para(doc, '[0100] 以上所述仅为本实用新型的较佳实施例而已，并不用以限制本实用新型，凡在本实用新型的精神和原则之内，所作的任何修改、等同替换、改进等，均应包含在本实用新型的保护范围之内。');

  doc.addPage();

  para(doc, '[0101] 制造工艺流程说明：');
  para(doc, '[0102] 本实用新型散热器的制造工艺流程如下：');
  para(doc, '[0103] 工序1：铝合金基板加工。采购6063-T5铝合金板材（厚度5mm），通过CNC铣削加工基板外形尺寸（120mm×120mm×4mm），铣削上表面安装槽（10条，宽1.8mm，深1.5mm，间距10mm），钻削四个安装孔（直径4mm）。加工精度要求：基板平面度≤0.05mm，安装槽宽度公差±0.05mm，深度公差±0.1mm。');
  para(doc, '[0104] 工序2：散热翅片加工。采购紫铜T2板材（厚度1.5mm），通过冲压工艺加工翅片外形（120mm×25mm），冲压后进行去毛刺处理。翅片尺寸精度要求：厚度公差±0.05mm，高度公差±0.1mm。');
  para(doc, '[0105] 工序3：表面清洗。将铝合金基板和紫铜翅片分别进行超声波清洗（清洗液为5%碱性清洗剂，温度60°C，时间5分钟），去除表面油污和氧化层。清洗后用去离子水冲洗，80°C烘干10分钟。');
  para(doc, '[0106] 工序4：焊接组装。在基板安装槽内预涂锡银铜焊锡膏（SAC305，粉末粒径25-45μm），将翅片逐片插入安装槽。将组装好的散热器放入回流焊炉，按预设温度曲线加热：预热区150°C/60秒→升温区217°C/30秒→峰值区240°C/10秒→冷却区。焊接完成后检查焊锡填充率（目视检查+X射线抽检）。');
  para(doc, '[0107] 工序5：阳极氧化处理。将焊接完成的散热器（含翅片）进行阳极氧化处理：碱洗脱脂（5%NaOH，60°C，3分钟）→酸洗中和（10%HNO₃，室温，1分钟）→阳极氧化（15%H₂SO₄，20°C，1.5A/dm²，30分钟）→沸水封孔（95°C，15分钟）。氧化膜厚度要求10-20μm。');
  para(doc, '[0108] 工序6：质量检验。对成品散热器进行以下质量检验：（1）外观检查：翅片无歪斜、无脱落，氧化层均匀无色差；（2）尺寸检查：关键尺寸符合图纸要求；（3）焊接质量检查：X射线抽检焊接填充率>90%；（4）散热性能抽检：在标准测试条件下（50W LED，25°C环境）测量LED结温≤92°C。');

  doc.addPage();

  para(doc, '[0109] 质量控制标准：');
  para(doc, '[0110] 本实用新型散热器的质量控制标准如下：');
  para(doc, '[0111] （1）来料检验：铝合金板材导热系数≥180W/(m·K)（激光闪射法测量），紫铜板材导热系数≥380W/(m·K)。焊锡膏金属含量88%-92%，焊粉粒径25-45μm。');
  para(doc, '[0112] （2）过程检验：焊接后焊锡填充率≥90%（X射线检查），翅片垂直度≤1°（角度尺测量），基板平面度≤0.05mm（平面度仪测量）。');
  para(doc, '[0113] （3）成品检验：氧化膜厚度10-20μm（涡流测厚仪测量），耐盐雾试验≥200小时（中性盐雾试验NSS），散热性能（50W，25°C环境）LED结温≤92°C。');
  para(doc, '[0114] （4）可靠性抽样：每批次抽取3件进行热循环测试（-40°C~85°C，50次循环），测试后焊接部位无开裂，散热性能无衰减。');
  para(doc, '[0115] （5）包装和储存：散热器用防静电袋包装，外包装用泡沫衬垫保护翅片。储存环境要求温度0-40°C，湿度≤70%RH，保质期2年。');

  para(doc, '[0116] 成本分析：');
  para(doc, '[0117] 实施例1散热器的成本构成如下：');
  para(doc, '[0118] （1）铝合金基板材料费：6063-T5铝板约25元/kg，基板重量约150g，材料费约3.75元。CNC加工费约5元/件（含安装槽和安装孔加工）。');
  para(doc, '[0119] （2）紫铜翅片材料费：紫铜T2板约65元/kg，10片翅片总重量约135g，材料费约8.78元。冲压加工费约2元/件。');
  para(doc, '[0120] （3）焊接辅材费：焊锡膏约0.5元/件，焊接电费和设备折旧约1元/件。');
  para(doc, '[0121] （4）阳极氧化处理费：约3元/件（含化学品、电费和人工）。');
  para(doc, '[0122] （5）质量检验和包装费：约2元/件。');
  para(doc, '[0123] 合计制造成本约26元/件，加上管理费用和利润，出厂价约30元/件。');

  doc.addPage();

  para(doc, '[0124] 环境适应性测试：');
  para(doc, '[0125] 除可靠性测试外，本实用新型散热器还进行了以下环境适应性测试：');
  para(doc, '[0126] （1）盐雾试验：按照GB/T 10125标准，进行中性盐雾试验（NSS），5%NaCl溶液，温度35°C，连续喷雾200小时。测试后检查阳极氧化层无起泡、无剥落，铜翅片无明显腐蚀。评级达到GB/T 6461标准的9级以上。');
  para(doc, '[0127] （2）温度冲击试验：按照GB/T 2423.22标准，进行温度冲击试验，高温85°C（保持30分钟）→转换时间<10秒→低温-40°C（保持30分钟），共100个循环。测试后检查焊接部位无开裂，翅片无脱落，散热性能无变化。');
  para(doc, '[0128] （3）恒定湿热试验：按照GB/T 2423.3标准，在40°C/93%RH条件下连续放置56天。测试后检查铝合金基板无腐蚀，铜翅片轻微变色（不影响散热性能），焊接部位无腐蚀。');
  para(doc, '[0129] （4）砂尘试验：按照GB/T 2423.37标准，进行吹砂试验（砂尘浓度10g/m³，风速8m/s，持续8小时）。测试后检查散热翅片间隙无堵塞，散热性能无明显下降（结温升高<2°C）。');
  para(doc, '[0130] （5）霉菌试验：按照GB/T 2423.16标准，进行霉菌试验（混合霉菌孢子，28°C/96%RH，28天）。测试后检查铝合金基板和阳极氧化层无霉菌生长。铜翅片本身具有抑菌性，无霉菌生长。');

  doc.addPage();

  para(doc, '[0131] 相关标准和认证：');
  para(doc, '[0132] 本实用新型散热器符合以下相关标准和认证要求：');
  para(doc, '[0133] （1）RoHS指令：散热器所用材料（铝合金、紫铜、焊锡合金、阳极氧化层）均符合欧盟RoHS指令（2011/65/EU）的有害物质限制要求，铅、汞、镉、六价铬等有害物质含量低于限值。');
  para(doc, '[0134] （2）REACH法规：散热器所用材料不含有REACH法规（EC 1907/2006）附录XIV中列出的高度关注物质（SVHC）。');
  para(doc, '[0135] （3）UL认证：散热器的铝合金基板和紫铜翅片均为不可燃材料，符合UL 94 V-0阻燃等级要求。阳极氧化层为无机涂层，不支持燃烧。');
  para(doc, '[0136] （4）IPC标准：焊接工艺符合IPC-A-610E（电子组件可接受性标准）中Class 2的要求，焊锡填充率≥90%，焊接表面光滑无虚焊。');
  para(doc, '[0137] （5）GB/T标准：散热器的尺寸公差符合GB/T 1804-m级（中等级）要求，表面粗糙度符合GB/T 1031的Ra1.6要求。');

  para(doc, '[0138] 知识产权声明：');
  para(doc, '[0139] 本实用新型的创新点在于：（1）在铝合金基板上设置安装槽，增大了翅片与基板的焊接面积，降低了焊接界面热阻；（2）散热翅片采用铜质材料，导热系数高于铝合金，提高了翅片效率；（3）翅片表面阳极氧化处理，提高了耐腐蚀性和辐射散热能力。上述创新点的组合使本实用新型在散热效率、制造成本和可靠性之间取得了良好的平衡。');

  doc.addPage();

  heading(doc, '说 明 书 摘 要', 14);
  doc.moveDown(1);
  para(doc, '本实用新型公开了一种散热器，包括铝合金基板和铜质散热翅片。基板上表面设置安装槽，散热翅片嵌入安装槽内并通过锡基焊料焊接固定。散热翅片材质为紫铜或黄铜，表面经阳极氧化处理。该散热器结构简单、散热效率高、制造成本低，适用于大功率LED灯具和功率半导体器件的散热。');

  doc.addPage();

  heading(doc, '摘 要 附 图 说 明', 14);
  doc.moveDown(1);
  para(doc, '图1为本实用新型提供的散热器的整体结构立体示意图。图中：1-铝合金基板；2-散热翅片；3-安装区域；4-安装槽；5-焊接层；6-安装孔。');

  doc.end();
  console.log('D1 PDF generated');
}

// ============================================================
// D2: CN109XXXXXXB - 热管散热装置
// ============================================================
function generateD2() {
  const doc = createDoc(
    path.join(BASE, 'CN109XXXXXXB-热管散热.pdf'),
    '一种热管散热装置',
    '申请人'
  );

  doc.moveDown(8);
  heading(doc, '发 明 专 利 申 请 书', 26);
  doc.moveDown(2);
  heading(doc, '一种热管散热装置', 20);
  doc.moveDown(4);
  [
    ['申请号', 'CN109XXXXXXB'],
    ['申请日', '2022年03月08日'],
    ['授权公告日', '2022年09月20日'],
    ['申请人', '深圳市热通科技有限公司'],
    ['地址', '广东省深圳市宝安区西乡街道固戍社区航城大道368号'],
    ['发明人', '王志强  李明  赵文华'],
  ].forEach(([l, v]) => {
    doc.font('CJK').fontSize(12).text(`${l}：${v}`, { align: 'left', indent: 48, lineGap: 6 });
  });
  doc.moveDown(6);
  doc.font('CJK').fontSize(10).text('权利要求书  共8项', { align: 'center', lineGap: 2 });
  doc.text('说明书  共21页', { align: 'center', lineGap: 2 });
  doc.text('说明书附图  共5幅', { align: 'center', lineGap: 2 });
  doc.text('说明书摘要  共1页', { align: 'center' });

  doc.addPage();

  heading(doc, '权 利 要 求 书', 18);
  doc.moveDown(1);
  claim(doc, '1. 一种热管散热装置，其特征在于，包括：\n散热基板，所述散热基板上表面设置有安装区域和凹槽；\n热管，数量为2-6根，所述热管的蒸发端嵌入所述凹槽内并通过焊接固定，冷凝端延伸出所述散热基板；\n散热翅片，通过穿片工艺套装在所述热管的冷凝端，所述散热翅片为铝合金翅片。');
  claim(doc, '2. 根据权利要求1所述的热管散热装置，其特征在于，所述热管为铜-水热管，直径为4-8mm，内部设有烧结铜粉吸液芯。');
  claim(doc, '3. 根据权利要求1所述的热管散热装置，其特征在于，所述热管的蒸发端与所述凹槽之间通过锡银铜无铅焊料焊接固定。');
  claim(doc, '4. 根据权利要求1所述的热管散热装置，其特征在于，所述散热翅片数量为20-40片，翅片厚度为0.3-0.8mm，翅片间距为1.5-3.0mm。');
  claim(doc, '5. 根据权利要求1所述的热管散热装置，其特征在于，所述散热翅片表面经过阳极氧化处理，氧化膜厚度为10-20μm。');
  claim(doc, '6. 根据权利要求1至5任一项所述的热管散热装置，其特征在于，所述散热基板上表面的安装区域涂覆有导热硅脂，热导率不低于5W/(m·K)。');
  claim(doc, '7. 根据权利要求1所述的热管散热装置，其特征在于，所述热管的蒸发端长度为30-50mm，冷凝端长度为80-120mm，热管总长度为120-180mm。');
  claim(doc, '8. 根据权利要求1所述的热管散热装置，其特征在于，所述散热基板的材质为6063-T5铝合金或紫铜T2，基板厚度为3-8mm。');

  doc.addPage();

  heading(doc, '说  明  书', 18);
  doc.moveDown(1);
  heading(doc, '一种热管散热装置', 14);
  doc.moveDown(1);

  heading(doc, '【技术领域】', 13);
  para(doc, '[0001] 本发明涉及电子元器件散热技术领域，具体涉及一种利用热管进行高效传热的散热装置。更特别地，本发明涉及一种将热管蒸发端嵌入散热基板凹槽并通过焊接固定的热管散热装置，适用于大功率LED灯具、功率半导体模块、服务器CPU等高热流密度电子元器件的散热。');

  heading(doc, '【背景技术】', 13);
  para(doc, '[0002] 随着电子元器件功率密度的不断提高，传统的铝合金翅片散热器在高热流密度应用中已难以满足散热需求。热管作为一种利用管内工质相变传热的高效传热元件，其等效导热系数可达铜的数十倍至数百倍，是解决高热流密度散热问题的理想方案。');
  para(doc, '[0003] 烅管的基本工作原理是：管内工质在蒸发端吸收热量蒸发为蒸汽，蒸汽在压差驱动下流向冷凝端，在冷凝端释放热量凝结为液体，液体在毛细力或重力作用下回流至蒸发端，如此循环往复实现高效传热。');
  para(doc, '[0004] 中国专利申请CN105XXXXXXA公开了一种热管散热器，将热管的蒸发端通过机械压紧方式与散热基板接触，冷凝端套装散热翅片。然而，机械压紧方式存在以下问题：（1）热管与基板之间的接触热阻较大（约0.2-0.5°C·cm²/W），影响散热效率；（2）长期使用后压紧力可能因材料蠕变而下降，导致接触热阻增大；（3）机械压紧结构增加了散热器的体积和重量。');
  para(doc, '[0005] 中国专利申请CN106XXXXXXB公开了一种热管散热器，将热管的蒸发端直接焊接在散热基板表面。焊接方式降低了接触热阻，但热管与基板之间的焊接面积有限（仅热管外壁与基板上表面的线接触），焊接强度较低，在振动环境中存在脱落风险。');
  para(doc, '[0006] 因此，需要一种热管与基板之间接触热阻低、连接强度高、可靠性好的热管散热装置。');

  heading(doc, '【发明内容】', 13);
  para(doc, '[0007] 针对现有技术中存在的上述技术问题，本发明的目的在于提供一种热管散热装置，该装置通过将热管蒸发端嵌入散热基板的凹槽内并焊接固定，增大了热管与基板的接触面积，降低了接触热阻，提高了连接强度和可靠性。');
  para(doc, '[0008] 为实现上述目的，本发明采用如下技术方案：');
  para(doc, '[0009] 一种热管散热装置，包括散热基板、热管和散热翅片。');
  para(doc, '[0010] 所述散热基板为铝合金或铜合金基板，厚度为3-8mm。基板上表面沿长度方向设置有2-6条平行凹槽，凹槽截面为半圆形或U形，深度为热管半径的80%-100%，宽度与热管直径匹配。凹槽之间的间距为10-25mm。基板下表面中央区域为安装区域，用于安装发热元件。');
  para(doc, '[0011] 所述热管为铜-水热管，直径为4-8mm，长度为120-180mm。热管内部设有烧结铜粉吸液芯，吸液芯厚度0.5-1.0mm，孔隙率55%-70%。热管的蒸发端（长度30-50mm）嵌入基板的凹槽内，通过锡银铜无铅焊料焊接固定。热管的冷凝端（长度80-120mm）穿过散热翅片。');
  para(doc, '[0012] 所述散热翅片为铝合金翅片，通过穿片工艺套装在热管的冷凝端。翅片数量为20-40片，厚度为0.3-0.8mm，间距为1.5-3.0mm。翅片上设置有与热管直径匹配的穿孔，穿孔内壁涂覆导热硅脂以降低翅片与热管之间的接触热阻。');
  para(doc, '[0013] 进一步地，所述散热翅片的表面经过阳极氧化处理，氧化膜厚度为10-20μm，提高耐腐蚀性和表面辐射率。');
  para(doc, '[0014] 进一步地，所述散热基板上表面的安装区域涂覆有导热硅脂，热导率不低于5W/(m·K)。');
  para(doc, '[0015] 进一步地，所述热管的管壁厚度为0.3-0.6mm，工质充装率为25%-40%。');
  para(doc, '[0016] 本发明的有益效果：');
  para(doc, '[0017] （1）通过将热管蒸发端嵌入基板的凹槽内，热管与基板的接触面积从传统的线接触（热管外壁与基板上表面的切线接触）增大为面接触（凹槽内壁包裹热管半圆周面），接触面积增加了约1.5倍，焊接界面热阻降低了约60%。');
  para(doc, '[0018] （2）热管蒸发端在凹槽内被焊锡包裹固定，连接强度高，抗拉拔力>50N，远高于传统的机械压紧方式（约10-20N），在振动环境中不易脱落。');
  para(doc, '[0019] （3）凹槽起到了定位和导向作用，热管在凹槽内自动对中，提高了装配精度和一致性。');
  para(doc, '[0020] （4）散热翅片通过穿片工艺套装在热管上，工艺简单，成本低，翅片数量和间距可灵活调整。');

  doc.addPage();

  heading(doc, '【附图说明】', 13);
  para(doc, '[0021] 图1为本发明提供的热管散热装置的整体结构立体示意图。');
  para(doc, '[0022] 图2为本发明提供的热管散热装置的纵向剖面结构示意图，示出热管蒸发端嵌入基板凹槽的结构。');
  para(doc, '[0023] 图3为本发明提供的热管散热装置的横向剖面结构示意图，示出热管在凹槽内的截面形状。');
  para(doc, '[0024] 图4为本发明提供的热管散热装置的分解结构示意图，示出各部件的装配关系。');
  para(doc, '[0025] 图5为本发明提供的热管散热装置与对比例1（机械压紧式）的温度-时间曲线对比图。');
  para(doc, '[0026] 附图标记说明：1-散热基板；2-热管；3-散热翅片；4-凹槽；5-安装区域；6-焊接层；7-导热硅脂层；8-穿孔。');

  doc.addPage();

  heading(doc, '【具体实施方式】', 13);
  para(doc, '[0027] 下面结合附图和实施例对本发明作进一步详细说明。');
  para(doc, '[0028] 实施例1：');
  para(doc, '[0029] 参照图1至图4，本实施例提供一种热管散热装置，包括散热基板1、4根热管2和散热翅片3。');
  para(doc, '[0030] 散热基板1采用6063-T5铝合金，外形尺寸为130mm×130mm×5mm。基板上表面沿长度方向设置4条平行半圆形凹槽4，凹槽半径3mm（对应热管直径6mm），深度3mm，间距25mm。基板下表面中央区域（80mm×80mm）为安装区域5。基板四个角部各有一个直径4mm的安装孔。');
  para(doc, '[0031] 热管2为铜-水热管，直径6mm，总长度140mm。热管管壁为紫铜，壁厚0.4mm。内部烧结铜粉吸液芯，吸液芯厚度0.8mm，孔隙率62%。工质为去离子水，充装率32%。热管蒸发端长度40mm，嵌入基板凹槽内；冷凝端长度100mm，穿过散热翅片。');
  para(doc, '[0032] 热管蒸发端嵌入基板凹槽后，通过锡银铜无铅焊料（SAC305，熔点217-220°C）焊接固定。焊接工艺：在凹槽内预涂焊锡膏，将热管放入凹槽，在回流焊炉中加热至240°C，保温30秒后冷却。焊接完成后，焊锡填充凹槽与热管之间的间隙，焊接层6厚度约0.3mm。');
  para(doc, '[0033] 经测试，热管蒸发端与基板之间的焊接界面热阻为0.02°C·cm²/W，远低于传统的机械压紧方式（0.3°C·cm²/W），降低了93%。热管的抗拉拔力为65N，远高于机械压紧方式（15N）。');
  para(doc, '[0034] 散热翅片3为6063铝合金翅片，通过穿片工艺套装在4根热管的冷凝端。翅片数量30片，外形尺寸130mm×100mm，厚度0.5mm，间距2.5mm。翅片上设置4个穿孔8，孔径6.2mm（比热管直径大0.2mm），穿孔内壁涂覆导热硅脂（热导率5W/(m·K)）。');
  para(doc, '[0035] 散热翅片表面经阳极氧化处理，氧化膜厚度15μm，表面发射率0.85。');

  doc.addPage();

  para(doc, '[0036] 经测试，本实施例的热管散热装置在安装50W大功率LED模组连续工作2小时后，LED芯片结温为75°C，散热基板表面最高温度为55°C，热管蒸发端温度58°C，冷凝端翅片根部温度48°C，热管轴向温差10°C，说明热管具有良好的轴向传热能力。散热器总重量480g，成本约85元。');

  para(doc, '[0037] 实施例2：');
  para(doc, '[0038] 与实施例1的区别在于：');
  para(doc, '[0039] （1）热管数量增至6根，直径减至4mm，间距15mm。凹槽半径相应调整为2mm。');
  para(doc, '[0040] （2）散热翅片数量增至40片，间距1.5mm，以容纳更多热管。');
  para(doc, '[0041] 经测试，本实施例在50W连续工作2小时后，LED芯片结温为73°C，较实施例1降低2°C，但散热器重量增至552g，成本增至110元。');

  para(doc, '[0042] 实施例3：');
  para(doc, '[0043] 与实施例1的区别在于：');
  para(doc, '[0044] （1）散热基板1材质改为紫铜T2，导热系数390W/(m·K)，是铝合金的约2倍。基板厚度减至3mm。');
  para(doc, '[0045] （2）热管直径增至8mm，凹槽半径调整为4mm。');
  para(doc, '[0046] 经测试，本实施例在50W连续工作2小时后，LED芯片结温为70°C，较实施例1降低5°C，但散热器重量增至680g，成本增至150元。');

  para(doc, '[0047] 实施例4：强制风冷辅助');
  para(doc, '[0048] 在实施例1的基础上增加一台120mm×120mm轴流风扇（2000RPM，55CFM）。');
  para(doc, '[0049] 经测试，在强制风冷条件下，50W连续工作2小时后LED芯片结温为58°C，较自然对流（75°C）降低17°C。');

  doc.addPage();

  para(doc, '[0050] 对比例1：机械压紧式热管散热器');
  para(doc, '[0051] 对比例1采用与实施例1相同规格的热管（4根，直径6mm）和散热翅片（30片），但热管蒸发端通过机械压紧方式（弹簧螺栓压紧）与散热基板接触，而非嵌入凹槽焊接。');
  para(doc, '[0052] 经测试，对比例1在50W连续工作2小时后，LED芯片结温为82°C，较实施例1（75°C）高出7°C。原因是机械压紧的接触热阻（0.3°C·cm²/W）远大于焊接方式（0.02°C·cm²/W）。此外，经500次热循环测试后，对比例1的接触热阻增大至0.5°C·cm²/W（弹簧松弛），而实施例1的焊接热阻无变化。');

  para(doc, '[0053] 对比例2：表面焊接式热管散热器');
  para(doc, '[0054] 对比例2的热管蒸发端直接放置在基板上表面（无凹槽），通过锡焊焊接固定。焊接面积仅为热管外壁与基板上表面的线接触区域。');
  para(doc, '[0055] 经测试，对比例2在50W连续工作2小时后，LED芯片结温为78°C，较实施例1（75°C）高出3°C。原因是线接触的焊接面积小，焊接界面热阻约为0.08°C·cm²/W，是实施例1（0.02°C·cm²/W）的4倍。此外，对比例2的热管抗拉拔力仅为25N，在振动测试中有1根热管脱落。');

  doc.addPage();

  para(doc, '[0056] 表1 各实施例和对比例的性能对比');
  doc.font('CJK').fontSize(10);
  const t2 = [
    ['项目', '实施例1', '实施例2', '实施例3', '实施例4', '对比例1', '对比例2'],
    ['热管数量', '4', '6', '4', '4', '4', '4'],
    ['热管直径(mm)', '6', '4', '8', '6', '6', '6'],
    ['基板材质', '铝', '铝', '铜', '铝', '铝', '铝'],
    ['连接方式', '凹槽焊接', '凹槽焊接', '凹槽焊接', '凹槽焊接', '压紧', '表面焊接'],
    ['界面热阻', '0.02', '0.02', '0.015', '0.02', '0.30', '0.08'],
    ['50W结温(°C)', '75', '73', '70', '58', '82', '78'],
    ['抗拉拔力(N)', '65', '60', '70', '65', '15', '25'],
    ['重量(g)', '480', '552', '680', '510', '460', '440'],
    ['成本(元)', '85', '110', '150', '95', '75', '70'],
  ];
  const colW2 = 451.28 / t2[0].length;
  let sy2 = doc.y;
  t2.forEach((row, ri) => {
    const rowH = 20;
    if (sy2 + rowH > 769.89) { doc.addPage(); sy2 = 72; }
    row.forEach((cell, ci) => {
      const x = 72 + ci * colW2;
      doc.rect(x, sy2, colW2, rowH).stroke();
      doc.font('CJK').fontSize(8).text(cell, x + 2, sy2 + 4, { width: colW2 - 4, align: 'center', lineBreak: false });
    });
    sy2 += rowH;
  });
  doc.y = sy2 + 12;

  doc.addPage();

  para(doc, '[0057] 热管工作原理详细说明：');
  para(doc, '[0058] 热管是一种利用管内工质蒸发-冷凝循环实现高效传热的被动传热元件。热管的传热过程包括以下步骤：（1）工质在蒸发端吸收热量，从液态蒸发为蒸汽（吸热过程）；（2）蒸汽在管内压差驱动下从蒸发端流向冷凝端（传热过程）；（3）蒸汽在冷凝端释放热量，从蒸汽冷凝为液态（放热过程）；（4）液态工质在吸液芯毛细力作用下从冷凝端回流至蒸发端（回流过程）。');
  para(doc, '[0059] 热管的传热能力受限于以下极限：（1）毛细极限：吸液芯的毛细力必须大于工质流动的阻力，否则工质无法回流，热管干涸；（2）沸腾极限：蒸发端的热流密度不能过高，否则工质在蒸发端剧烈沸腾，形成蒸汽膜，阻碍工质与管壁的接触；（3）声速极限：蒸汽流速不能超过声速，否则蒸汽流动受阻；（4）携带极限：高速蒸汽会携带液态工质回流至冷凝端，降低回流效率。');
  para(doc, '[0060] 本发明采用的烧结铜粉吸液芯具有以下优点：（1）毛细力强（孔径小），可克服较大的流动阻力；（2）渗透率高（孔隙率大），工质流动阻力小；（3）径向导热好（铜粉导热系数高），蒸发端和冷凝端的传热效率高；（4）与管壁结合牢固，可靠性高。');

  para(doc, '[0061] 穿片工艺说明：');
  para(doc, '[0062] 穿片工艺是将预制好穿孔的散热翅片逐片套装在热管上的装配工艺。具体步骤：（1）在铝合金翅片上冲压出与热管直径匹配的穿孔（孔径比热管直径大0.2mm）；（2）将翅片逐片套装在热管的冷凝端，翅片间距由定位夹具保证；（3）套装完成后，在穿孔内壁注入导热硅脂；（4）将翅片与热管通过机械胀管或焊接方式固定。');
  para(doc, '[0063] 穿片工艺的优势：（1）翅片形状和数量可灵活调整，不受热管形状限制；（2）翅片可采用铝挤型板材，成本低；（3）工艺简单，自动化程度高，适合大批量生产。');

  doc.addPage();

  para(doc, '[0064] 热管传热能力计算：');
  para(doc, '[0065] 对实施例1的单根热管进行传热能力计算。');
  para(doc, '[0066] 热管参数：直径d=6mm，蒸发端长度Le=40mm，冷凝端长度Lc=100mm，绝热端长度La=0mm（蒸发端和冷凝端之间无绝热段），管壁厚度δw=0.4mm，吸液芯厚度δc=0.8mm，工质为水。');
  para(doc, '[0067] 毛细极限计算：热管的最大传热能力受限于吸液芯的毛细力。对于烧结铜粉吸液芯，有效毛细半径rc≈10μm，渗透率K≈10^(-10)m²，孔隙率ε=62%。');
  para(doc, '[0068] 毛细压力ΔPc=2σ/rc，其中σ为水的表面张力（在55°C时约为0.068N/m）。ΔPc=2×0.068/10^(-5)=13600Pa。');
  para(doc, '[0069] 液体流动阻力ΔPl=μl×L_eff/(K×Al×ρl)，其中μl为水的动力粘度（在55°C时约为5×10^(-4)Pa·s），L_eff=Le/2+La+Lc/2=20+0+50=70mm=0.07m，Al为吸液芯截面积=π×(d-2δw)×δc=π×5.2×0.8=13.07mm²=1.307×10^(-5)m²，ρl=985kg/m³。ΔPl=5×10^(-4)×0.07/(10^(-10)×1.307×10^(-5)×985)=2720Pa。');
  para(doc, '[0070] 蒸汽流动阻力ΔPv通常远小于液体流动阻力，可忽略。');
  para(doc, '[0071] 毛细极限条件：ΔPc≥ΔPl+ΔPv，即13600≥2720，满足条件，毛细力裕量充足。');
  para(doc, '[0072] 最大传热能力Qmax=ΔPc×Al×ρl×hfg/(μl×L_eff)，其中hfg为水的汽化潜热（在55°C时约为2370kJ/kg）。Qmax=13600×1.307×10^(-5)×985×2370×10³/(5×10^(-4)×0.07)=1245W。');
  para(doc, '[0073] 单根热管的最大传热能力约为1245W，远大于实际需求（50W÷4根=12.5W/根），传热能力裕量约100倍。这说明热管在正常工作条件下远未达到传热极限，可靠性极高。');

  doc.addPage();

  para(doc, '[0074] 热管等效热阻计算：');
  para(doc, '[0075] 热管的等效热阻由以下部分组成：蒸发端管壁热阻Rwe、蒸发端吸液芯热阻Rce、蒸发端相变热阻Re、蒸汽流动热阻Rv、冷凝端相变热阻Rc、冷凝端吸液芯热阻Rcc、冷凝端管壁热阻Rwc。');
  para(doc, '[0076] Rwe=ln(d/(d-2δw))/(2π×kw×Le)=ln(6/5.2)/(2π×390×0.04)=0.143/98.0=0.00146°C/W。');
  para(doc, '[0077] Rce=ln((d-2δw)/(d-2δw-2δc))/(2π×keff×Le)，其中keff为吸液芯等效导热系数（铜粉+水的复合导热系数约5W/(m·K)）。Rce=ln(5.2/3.6)/(2π×5×0.04)=0.367/1.257=0.292°C/W。');
  para(doc, '[0078] Re和Rc为相变热阻，通常很小（约0.01°C/W），可忽略。');
  para(doc, '[0079] Rv为蒸汽流动热阻，通常很小（约0.001°C/W），可忽略。');
  para(doc, '[0080] 单根热管总热阻Rhp=Rwe+Rce+Re+Rv+Rc+Rcc+Rwc≈0.00146+0.292+0.01+0.001+0.01+0.292+0.00146≈0.608°C/W。');
  para(doc, '[0081] 4根热管并联的等效热阻为0.608/4=0.152°C/W。在12.5W/根的负载下，热管轴向温降为12.5×0.152=1.9°C，与实测值（10°C）有一定差距，主要原因是实测温差包含了蒸发端和冷凝端的接触热阻以及翅片根部的扩散热阻。');

  doc.addPage();

  para(doc, '[0082] 可靠性测试：');
  para(doc, '[0083] 对实施例1的热管散热装置进行了以下可靠性测试：');
  para(doc, '[0084] （1）热循环测试：在-40°C至85°C温度范围内进行1000次热循环。测试后检查热管无泄漏，焊接部位无开裂，散热性能无衰减。LED芯片结温在50W功率下为76°C（测试前75°C），变化在测量误差范围内。');
  para(doc, '[0085] （2）高温老化测试：在85°C环境温度下，LED以50W功率连续工作2000小时。测试后热管无泄漏，吸液芯无脱落，散热性能无衰减。');
  para(doc, '[0086] （3）振动测试：按照IEC 60068-2-6标准，在10-500Hz频率范围内进行随机振动测试，加速度5Grms，三个方向各振动4小时。测试后检查热管无断裂、无泄漏，焊接部位无开裂，散热性能无变化。');
  para(doc, '[0087] （4）重力方向测试：将散热装置分别在竖直（热管垂直向上）、水平（热管水平）和倒置（热管垂直向下）三个方向进行50W散热测试。竖直方向结温75°C，水平方向结温78°C，倒置方向结温82°C。倒置方向性能下降7°C，原因是液态工质回流需克服重力，但仍在可接受范围内。烧结铜粉吸液芯的毛细力足以克服重力影响。');
  para(doc, '[0088] （5）长期寿命测试：在竖直方向、50W功率下连续工作10000小时（约14个月）。LED芯片结温在10000小时内保持在74-76°C范围内，无明显上升趋势，说明热管的传热性能在长期使用中保持稳定。');

  doc.addPage();

  para(doc, '[0089] 应用场景说明：');
  para(doc, '[0090] 本发明的热管散热装置可广泛应用于以下场景：');
  para(doc, '[0091] （1）大功率LED照明：LED路灯、隧道灯、工矿灯等，功率范围100-400W。热管的高效传热能力可将大量热量从LED端传导至远端散热翅片，适合需要集中散热的大功率照明场景。');
  para(doc, '[0092] （2）服务器CPU散热：数据中心服务器的CPU散热，热流密度可达50-100W/cm²。热管的高等效导热系数可有效应对高热流密度散热挑战。');
  para(doc, '[0093] （3）功率电子散热：IGBT、SiC MOSFET等功率半导体模块的散热。热管可在有限空间内实现高效传热，适合电力电子设备的紧凑型散热需求。');
  para(doc, '[0094] （4）5G通信设备散热：5G基站AAU（有源天线单元）的散热。AAU内部集成了大量射频功放芯片，发热量大，安装空间受限。热管散热装置可将热量均匀分布到整个散热器表面。');
  para(doc, '[0095] （5）笔记本电脑和游戏本散热：CPU和GPU的散热。热管的扁平化设计（如烧结热管可做到2mm厚度）适合笔记本电脑的超薄空间。');
  para(doc, '[0096] （6）新能源汽车电控散热：电动汽车的电机控制器、OBC（车载充电机）等电力电子设备的散热。热管的无运动部件特性适合车载振动环境。');

  doc.addPage();

  para(doc, '[0097] 制造工艺流程说明：');
  para(doc, '[0098] 本发明热管散热装置的制造工艺流程如下：');
  para(doc, '[0099] 工序1：热管制备。采购直径6mm、壁厚0.4mm的紫铜管，内壁烧结铜粉吸液芯（铜粉粒径75-150μm，烧结温度800°C/30分钟，氢气保护气氛），抽真空至10Pa以下，充装去离子水（充装率32%），封口焊接。每根热管需进行传热性能测试（50W输入，测量轴向温差≤15°C）。');
  para(doc, '[0100] 工序2：散热基板加工。6063-T5铝合金通过CNC铣削加工基板外形（130mm×130mm×5mm），铣削半圆形凹槽（4条，半径3mm，深3mm，间距25mm），钻削安装孔。凹槽尺寸精度要求：半径公差±0.05mm，深度公差±0.1mm。');
  para(doc, '[0101] 工序3：散热翅片加工。6063铝合金板材通过冲压加工翅片外形（130mm×100mm×0.5mm），冲压穿孔（4个，孔径6.2mm）。翅片表面进行阳极氧化处理（氧化膜厚度15μm）。');
  para(doc, '[0102] 工序4：热管与基板焊接组装。在基板凹槽内预涂锡银铜焊锡膏，将4根热管的蒸发端嵌入凹槽。放入回流焊炉焊接（峰值温度240°C，保温10秒）。焊接后进行X射线检查，确认焊锡填充率>90%。');
  para(doc, '[0103] 工序5：翅片穿片组装。将30片散热翅片逐片套装在热管的冷凝端，翅片间距由定位夹具保证（2.5mm）。穿片完成后在穿孔内壁注入导热硅脂。');
  para(doc, '[0104] 工序6：质量检验。对成品进行以下检验：（1）热管无泄漏（加压检漏，0.5MPa/10分钟无压降）；（2）焊接质量（X射线检查填充率>90%）；（3）散热性能（50W，25°C环境，LED结温≤78°C）。');

  doc.addPage();

  para(doc, '[0105] 成本分析：');
  para(doc, '[0106] 实施例1热管散热装置的成本构成如下：');
  para(doc, '[0107] （1）热管成本：4根直径6mm热管，含铜管、铜粉烧结、工质充装和封口，约15元/根，合计60元。热管是本装置的主要成本项，占总成本的71%。');
  para(doc, '[0108] （2）散热基板成本：6063-T5铝合金材料约2.5元，CNC加工约3元，合计5.5元。');
  para(doc, '[0109] （3）散热翅片成本：30片铝合金翅片，冲压加工约3元，阳极氧化约2元，合计5元。');
  para(doc, '[0110] （4）焊接和组装成本：焊锡膏、导热硅脂、回流焊和穿片人工，合计约5元。');
  para(doc, '[0111] （5）质量检验和包装：约3元。');
  para(doc, '[0112] （6）管理和利润：约6.5元。');
  para(doc, '[0113] 合计出厂价约85元/件。热管成本占比最高（71%），是降低成本的主要优化方向。可通过批量采购、国产化替代等方式降低热管成本。');

  para(doc, '[0114] 与现有技术的创新点对比：');
  para(doc, '[0115] （1）与CN105XXXXXXA（机械压紧式热管散热器）相比：本发明将热管蒸发端嵌入基板凹槽并通过焊接固定，接触热阻从0.3°C·cm²/W降至0.02°C·cm²/W，降低了93%；抗拉拔力从15N增至65N，提高了333%。');
  para(doc, '[0116] （2）与CN106XXXXXXB（表面焊接式热管散热器）相比：本发明的凹槽设计增大了焊接面积（从线接触增至面接触），焊接界面热阻从0.08°C·cm²/W降至0.02°C·cm²/W，降低了75%；抗拉拔力从25N增至65N，提高了160%。');
  para(doc, '[0117] （3）与液冷散热系统相比：本发明无需泵、管路等辅助设备，无运动部件，零维护，成本仅为液冷系统的1/5以下。');

  doc.addPage();

  para(doc, '[0118] 环境适应性测试：');
  para(doc, '[0119] 本发明热管散热装置还进行了以下环境适应性测试：');
  para(doc, '[0120] （1）盐雾试验：按照GB/T 10125标准，进行中性盐雾试验（NSS），连续喷雾500小时。测试后检查铝合金翅片阳极氧化层无起泡、无剥落。散热基板的凹槽焊接部位无腐蚀（焊锡层保护）。');
  para(doc, '[0121] （2）温度冲击试验：按照GB/T 2423.22标准，-40°C至85°C温度冲击，100个循环。测试后检查热管无泄漏，焊接部位无开裂，散热性能无变化。');
  para(doc, '[0122] （3）低气压（高海拔）试验：按照GB/T 2423.21标准，在55kPa气压下（模拟海拔5000米）进行50W散热测试。LED芯片结温为80°C，较常压条件（75°C）升高5°C，原因是高海拔条件下空气密度降低，自然对流换热系数下降。热管在低气压条件下工作正常，无异常。');
  para(doc, '[0123] （4）盐水浸泡试验：将散热装置浸入3.5%NaCl盐水中24小时。测试后检查铝合金基板表面有轻微腐蚀点，但不影响散热性能。热管密封良好，无盐水渗入。建议在海洋环境中使用时增加防腐蚀涂层。');

  doc.addPage();

  para(doc, '[0124] 热管选型指南：');
  para(doc, '[0125] 在设计热管散热装置时，热管的选型需考虑以下因素：');
  para(doc, '[0126] （1）热管直径：常用直径为3mm、4mm、5mm、6mm、8mm。直径越大，单根传热能力越强，但弯曲半径也越大。6mm直径是最常用的规格，兼顾传热能力和加工性。');
  para(doc, '[0127] （2）吸液芯类型：烧结铜粉吸液芯（毛细力强，适合任意方向）、沟槽吸液芯（成本低，适合竖直方向）、丝网吸液芯（毛细力中等，适合弯曲热管）。本发明采用烧结铜粉吸液芯，适用于任意安装方向。');
  para(doc, '[0128] （3）工质选择：水（工作温度30-200°C，最常用）、甲醇（工作温度-40-100°C，适合低温应用）、丙酮（工作温度-60-80°C，适合极低温应用）。本发明采用水作为工质，工作温度范围覆盖LED散热的典型温度。');
  para(doc, '[0129] （4）热管长度：蒸发端和冷凝端的长度比影响热管的传热性能。推荐蒸发端长度为热管总长度的25%-35%，冷凝端长度为50%-65%。过短的蒸发端会导致热流密度过高，过短的冷凝端会导致散热不充分。');
  para(doc, '[0130] （5）热管数量：热管数量取决于总散热量和单根热管的传热能力。推荐热管总传热能力为实际散热量的3-5倍，留有充足的裕量。本实施例中4根6mm热管的总传热能力约为5000W，是实际需求（50W）的100倍，裕量充足。');

  para(doc, '[0131] 知识产权声明：');
  para(doc, '[0132] 本发明的创新点在于：（1）在散热基板上设置与热管蒸发端形状匹配的凹槽，将热管嵌入凹槽内并通过焊接固定，增大了热管与基板的接触面积，降低了焊接界面热阻；（2）凹槽设计提供了定位和导向功能，提高了装配精度和一致性；（3）焊接连接强度远高于传统的机械压紧方式，在振动环境中可靠性更高。');

  para(doc, '[0133] 发明人声明：');
  para(doc, '[0134] 以上所述仅为本发明的较佳实施例而已，并不用以限制本发明，凡在本发明的精神和原则之内，所作的任何修改、等同替换、改进等，均应包含在本发明的保护范围之内。');

  doc.addPage();

  heading(doc, '说 明 书 摘 要', 14);
  doc.moveDown(1);
  para(doc, '本发明公开了一种热管散热装置，包括散热基板、热管和散热翅片。散热基板上设置凹槽，热管蒸发端嵌入凹槽并通过焊接固定，冷凝端套装铝合金散热翅片。热管内部设有烧结铜粉吸液芯，利用工质相变实现高效传热。该装置散热效率高，适用于大功率LED灯具和功率半导体器件的散热。');

  doc.addPage();

  heading(doc, '摘 要 附 图 说 明', 14);
  doc.moveDown(1);
  para(doc, '图1为本发明提供的热管散热装置的整体结构立体示意图。图中：1-散热基板；2-热管；3-散热翅片；4-凹槽；5-安装区域；6-焊接层。');

  doc.end();
  console.log('D2 PDF generated');
}

// ============================================================
// D3: US20230000XXXA1 - Thermal Management Device (English)
// ============================================================
function generateD3() {
  const doc = createDoc(
    path.join(BASE, 'US20230000XXXA1-热管理.pdf'),
    'Thermal Management Device for Semiconductor Light Sources',
    'Applicant'
  );

  doc.moveDown(8);
  heading(doc, 'UNITED STATES PATENT APPLICATION', 22);
  doc.moveDown(2);
  heading(doc, 'Thermal Management Device\nfor Semiconductor Light Sources', 18);
  doc.moveDown(4);
  [
    ['Application No.', 'US 2023/0000XXX A1'],
    ['Filing Date', 'July 15, 2022'],
    ['Publication Date', 'January 15, 2023'],
    ['Applicant', 'ThermalTech Innovations Inc., San Jose, CA (US)'],
    ['Inventors', 'John R. Smith; Michael T. Johnson'],
    ['Assignee', 'ThermalTech Innovations Inc.'],
  ].forEach(([l, v]) => {
    doc.font('CJK').fontSize(12).text(`${l}: ${v}`, { align: 'left', indent: 48, lineGap: 6 });
  });
  doc.moveDown(4);
  doc.font('CJK').fontSize(10).text('Claims: 10', { align: 'center', lineGap: 2 });
  doc.text('Specification: 22 pages', { align: 'center', lineGap: 2 });
  doc.text('Drawing Sheets: 5', { align: 'center', lineGap: 2 });
  doc.text('Abstract: 1 page', { align: 'center' });

  doc.addPage();

  heading(doc, 'CLAIMS', 18);
  doc.moveDown(1);
  claim(doc, '1. A thermal management device for a semiconductor light source, comprising:\na sealed housing defining an internal chamber, the housing formed of a thermally conductive material;\na phase change material disposed within the internal chamber, the phase change material having a melting point between 40°C and 70°C and a latent heat of fusion of at least 180 kJ/kg;\na thermally conductive substrate mounted on an upper surface of the housing;\na semiconductor light source mounted on the substrate;\na plurality of cooling fins integrally formed on an outer surface of the housing.');
  claim(doc, '2. The device of claim 1, wherein the phase change material is a paraffin-based material or a salt hydrate material.');
  claim(doc, '3. The device of claim 1, further comprising a porous metal foam structure disposed within the internal chamber, the metal foam having a porosity of 85%-95% and a pore size of 0.5-2.0 mm.');
  claim(doc, '4. The device of claim 1, wherein the thermally conductive substrate is an aluminum nitride ceramic substrate with a thickness of 0.5-3 mm, or a direct copper bond (DCB) substrate.');
  claim(doc, '5. The device of claim 1, wherein the sealed housing is formed of copper or aluminum alloy, and the internal chamber is evacuated to a vacuum level of 10-100 Pa.');
  claim(doc, '6. The device of claim 1, wherein the plurality of cooling fins comprises 8-24 fins, each fin having a height of 10-40 mm and a spacing of 3-8 mm.');
  claim(doc, '7. The device of claim 1, further comprising a thermal interface material layer disposed between the semiconductor light source and the substrate, the thermal interface material having a thermal conductivity of at least 5 W/(m·K).');
  claim(doc, '8. The device of claim 1, wherein the phase change material occupies 80%-95% of the volume of the internal chamber.');
  claim(doc, '9. The device of claim 1, further comprising a temperature sensor and an alarm module, the temperature sensor being attached to a lower surface of the substrate.');
  claim(doc, '10. A method of manufacturing a thermal management device, comprising:\nforming a sealed housing with an internal chamber by die casting;\ndisposing a porous metal foam structure within the internal chamber;\nfilling the internal chamber with a phase change material;\nevacuating the internal chamber and sealing;\nmounting a thermally conductive substrate on an upper surface of the housing;\nmounting a semiconductor light source on the substrate.');

  doc.addPage();

  heading(doc, 'SPECIFICATION', 18);
  doc.moveDown(1);
  heading(doc, 'Thermal Management Device\nfor Semiconductor Light Sources', 14);
  doc.moveDown(1);

  heading(doc, 'TECHNICAL FIELD', 13);
  para(doc, '[0001] The present invention relates to thermal management of semiconductor light sources, and more particularly to a thermal management device utilizing phase change materials for efficient heat absorption and thermal buffering in high-power LED lighting applications.');

  heading(doc, 'BACKGROUND', 13);
  para(doc, '[0002] High-power semiconductor light sources, particularly light-emitting diodes (LEDs), generate significant heat during operation. The electrical-to-optical conversion efficiency of LEDs is typically 30%-40%, meaning that 60%-70% of the input electrical power is dissipated as heat. If this heat is not effectively removed, the LED junction temperature rises, leading to reduced luminous efficacy, color shift, and shortened operational lifetime.');
  para(doc, '[0003] Existing thermal management solutions for LED lighting include passive heat sinks with aluminum or copper fins, active cooling with fans, and liquid cooling systems. Each approach has its limitations:');
  para(doc, '[0004] Passive heat sinks with fins rely on natural convection and radiation to dissipate heat. US Patent Application US2020/0012345A1 describes a heat sink with aluminum fins attached to a base plate via brazing. While effective for moderate power levels (up to 30W), the thermal interface resistance between the base and fins limits performance at higher power densities. The heat sink also has limited thermal mass, resulting in significant temperature fluctuations during power transients.');
  para(doc, '[0005] Active cooling with fans provides higher heat dissipation capacity but introduces noise, power consumption, and reliability concerns due to the mechanical moving parts. Fan bearings have a limited lifespan (typically 30,000-50,000 hours) that may be shorter than the LED itself (50,000-100,000 hours).');
  para(doc, '[0006] Liquid cooling systems offer the highest cooling capacity but are complex, expensive, and require pumps, tubing, and a radiator. They are impractical for most general lighting applications.');
  para(doc, '[0007] Phase change materials (PCMs) have been used in thermal energy storage applications for decades. PCMs absorb large amounts of heat during the solid-to-liquid phase transition while maintaining a nearly constant temperature. This property makes them attractive for thermal buffering in electronic cooling applications.');
  para(doc, '[0008] US Patent Application US2019/0056789A1 describes a thermal management device using a phase change material enclosed in a sealed container for cooling electronic components. However, the device described therein does not include a porous metal foam structure to enhance thermal conduction within the PCM, resulting in poor heat distribution and slow thermal response.');
  para(doc, '[0009] Therefore, there is a need for a thermal management device that combines the thermal buffering capability of phase change materials with enhanced internal thermal conduction, providing efficient, passive, and reliable cooling for high-power semiconductor light sources.');

  heading(doc, 'SUMMARY OF INVENTION', 13);
  para(doc, '[0010] The present invention provides a thermal management device for semiconductor light sources that addresses the limitations of prior art solutions. The device utilizes a phase change material enclosed in a sealed housing, with a porous metal foam structure to enhance internal thermal conduction, and integrally formed cooling fins for external heat dissipation.');
  para(doc, '[0011] In one aspect, the present invention provides a thermal management device comprising: a sealed housing defining an internal chamber, the housing formed of a thermally conductive material such as copper or aluminum alloy; a phase change material disposed within the internal chamber, the PCM having a melting point between 40°C and 70°C and a latent heat of fusion of at least 180 kJ/kg; a thermally conductive substrate mounted on an upper surface of the housing; a semiconductor light source mounted on the substrate; and a plurality of cooling fins integrally formed on an outer surface of the housing.');
  para(doc, '[0012] In another aspect, the device further comprises a porous metal foam structure disposed within the internal chamber. The metal foam has a porosity of 85%-95% and a pore size of 0.5-2.0 mm. The metal foam enhances thermal conduction within the PCM by providing a high-conductivity skeletal structure that distributes heat uniformly throughout the chamber.');
  para(doc, '[0013] In yet another aspect, the internal chamber is evacuated to a vacuum level of 10-100 Pa before sealing. Evacuation removes air that would otherwise impede heat transfer within the chamber (air thermal conductivity is only 0.026 W/(m·K)).');
  para(doc, '[0014] The present invention provides several advantages over prior art solutions:');
  para(doc, '[0015] (1) The phase change material absorbs large amounts of heat during phase transition (latent heat), providing effective thermal buffering during LED startup and power transients. This reduces the temperature fluctuation amplitude by 60%-80% compared to conventional heat sinks.');
  para(doc, '[0016] (2) The PCM fills the internal chamber and is in direct contact with the housing walls, eliminating the thermal interface resistance present in heat pipe and conventional heat sink designs.');
  para(doc, '[0017] (3) The porous metal foam structure enhances internal thermal conduction, overcoming the inherently low thermal conductivity of PCMs (typically 0.1-0.3 W/(m·K)).');
  para(doc, '[0018] (4) The cooling fins are integrally formed with the housing, eliminating the thermal interface resistance between fins and base.');
  para(doc, '[0019] (5) The device has no moving parts, requires no maintenance, and has an essentially unlimited operational lifetime, unlike fan-based cooling systems.');

  doc.addPage();

  heading(doc, 'BRIEF DESCRIPTION OF DRAWINGS', 13);
  para(doc, '[0020] FIG. 1 is a perspective view of the thermal management device according to an embodiment of the present invention.');
  para(doc, '[0021] FIG. 2 is a cross-sectional view of the thermal management device of FIG. 1, showing the internal structure including the PCM, metal foam, and cooling fins.');
  para(doc, '[0022] FIG. 3 is a top view of the thermal management device, showing the arrangement of cooling fins and the LED substrate.');
  para(doc, '[0023] FIG. 4 is a cross-sectional view of an alternative embodiment using a salt hydrate PCM and copper foam.');
  para(doc, '[0024] FIG. 5 is a graph comparing the temperature-time curves of the present invention (Example 1) with a conventional aluminum heat sink (Comparative Example 1) during LED startup and steady-state operation.');
  para(doc, '[0025] Reference numerals: 1-sealed housing; 2-phase change material; 3-thermally conductive substrate; 4-LED chip; 5-thermal interface material; 6-cooling fins; 7-porous metal foam; 8-evacuation valve; 9-temperature sensor; 10-anti-corrosion coating; 11-internal chamber.');

  doc.addPage();

  heading(doc, 'DETAILED DESCRIPTION', 13);
  para(doc, '[0026] The following detailed description is provided to enable a person skilled in the art to make and use the invention. Various modifications to the disclosed embodiments will be readily apparent to those skilled in the art.');

  para(doc, '[0027] Example 1:');
  para(doc, '[0028] Referring to FIGS. 1-3, a thermal management device according to the present invention comprises a sealed housing 1, a phase change material 2, a thermally conductive substrate 3, LED chips 4, a thermal interface material 5, cooling fins 6, and a porous metal foam structure 7.');
  para(doc, '[0029] The sealed housing 1 is formed of 6063-T5 aluminum alloy by die casting. The housing has outer dimensions of 120 mm × 120 mm × 25 mm (length × width × height), with a wall thickness of 2 mm. The housing defines an internal chamber 11 with inner dimensions of 116 mm × 116 mm × 21 mm and a volume of approximately 282 cm³. The upper surface of the housing is flat, providing a mounting surface for the thermally conductive substrate 3. The lower surface and four side surfaces have cooling fins 6 integrally formed by die casting.');
  para(doc, '[0030] The phase change material 2 is a paraffin-based composite PCM consisting of n-docosane (70% by weight) and n-octadecane (30% by weight). The PCM has a melting point of 55°C, a latent heat of fusion of 250 kJ/kg, and a thermal conductivity of 0.21 W/(m·K). The PCM fills 90% of the chamber volume (approximately 254 cm³, mass approximately 190 g).');
  para(doc, '[0031] The porous metal foam structure 7 is made of copper foam with a porosity of 92% and a pore size of 0.8 mm. The copper foam is disposed within the internal chamber 11, covering all inner walls. The copper foam enhances thermal conduction within the PCM by providing a high-conductivity skeletal structure (copper thermal conductivity: 390 W/(m·K)) that distributes heat uniformly throughout the chamber. The effective thermal conductivity of the PCM-copper foam composite is approximately 5-8 W/(m·K), which is 25-40 times higher than pure PCM.');
  para(doc, '[0032] The thermally conductive substrate 3 is an aluminum nitride (AlN) ceramic substrate with dimensions of 80 mm × 80 mm and a thickness of 2 mm. The AlN substrate has a thermal conductivity of 200 W/(m·K) and a coefficient of thermal expansion (CTE) of 4.5 ppm/°C, which closely matches that of LED chips (typically 5-7 ppm/°C). The substrate is bonded to the upper surface of the housing using a high-temperature thermally conductive epoxy adhesive (thermal conductivity 3 W/(m·K)).');
  para(doc, '[0033] The LED chips 4 are four Cree XHP70.2 high-power LED chips, each rated at 12.5W, for a total power of 50W. The chips are arranged in a 2×2 array with a spacing of 15 mm. Each chip is a flip-chip design mounted on the AlN substrate via gold-tin eutectic soldering (AuSn, melting point 280°C). The solder layer thickness is approximately 3 μm with a thermal conductivity of 57 W/(m·K).');

  doc.addPage();

  para(doc, '[0034] The thermal interface material 5 is a phase-change thermal pad with a thickness of 0.15 mm and a thermal conductivity of 8 W/(m·K). The pad is solid at room temperature and becomes semi-solid at LED operating temperatures (50-80°C), automatically filling the microscopic gaps between the AlN substrate and the aluminum housing.');
  para(doc, '[0035] The cooling fins 6 are integrally formed with the housing by die casting. There are 16 fins, each with a height of 30 mm, a thickness of 1.5 mm, and a spacing of 5 mm. The total fin surface area is approximately 1,152 cm². Combined with the housing outer surface area (approximately 864 cm²), the total heat dissipation surface area is approximately 2,016 cm².');
  para(doc, '[0036] The internal chamber 11 is evacuated to a vacuum level of 50 Pa through an evacuation valve 8 before sealing. Evacuation removes air that would impede heat transfer within the chamber.');
  para(doc, '[0037] A temperature sensor 9 (NTC thermistor, 10 kΩ at 25°C) is attached to the lower surface of the AlN substrate. An alarm module is provided on the side of the housing, which activates an LED indicator and buzzer when the substrate temperature exceeds 85°C.');

  doc.addPage();

  para(doc, '[0038] Testing results for Example 1:');
  para(doc, '[0039] (1) Steady-state performance: After 2 hours of continuous operation at 50W total LED power, the LED junction temperature is 78°C, and the maximum housing surface temperature is 62°C. Compared to a conventional aluminum heat sink of the same size (Comparative Example 1, junction temperature 90°C), the junction temperature is reduced by 12°C. The temperature distribution on the housing surface is uniform, with a maximum temperature difference of only 3°C (compared to 8°C for the conventional heat sink).');
  para(doc, '[0040] (2) Startup temperature transient: During LED startup from cold state to steady state, the LED chip temperature rises smoothly with an overshoot of only 2°C (compared to 15°C for the conventional heat sink). The temperature fluctuation amplitude is reduced by 87%. This demonstrates that the PCM effectively absorbs the transient thermal shock during LED startup.');
  para(doc, '[0041] (3) Power step response: When the LED power is suddenly increased from 30W to 50W, the LED chip temperature rises from 68°C to 76°C within 30 seconds (temperature rise of 8°C). For the conventional heat sink under the same conditions, the temperature rises from 80°C to 95°C (temperature rise of 15°C). The PCM effectively suppresses the temperature冲击 caused by power transients.');
  para(doc, '[0042] (4) Maximum cooling capacity: The maximum cooling capacity of Example 1 is approximately 80W (corresponding to an LED junction temperature of 120°C), providing a 60% thermal design margin for the 50W application.');

  doc.addPage();

  para(doc, '[0043] Example 2:');
  para(doc, '[0044] Example 2 differs from Example 1 in the following aspects:');
  para(doc, '[0045] (1) The PCM is sodium phosphate dodecahydrate (Na₂HPO₄·12H₂O), a salt hydrate PCM with a melting point of 36°C and a latent heat of fusion of 280 kJ/kg. To address the supercooling issue of salt hydrates, 3% by weight of borax (Na₂B₄O₇·10H₂O) is added as a nucleating agent. To address the phase separation issue, 2% by weight of sodium carboxymethyl cellulose (CMC) is added as a thickening agent.');
  para(doc, '[0046] (2) The porous metal foam structure is copper foam with a porosity of 90% and a pore size of 1.0 mm, mechanically pressed into the internal chamber.');
  para(doc, '[0047] (3) The housing material is changed to copper (C11000), with a thermal conductivity of 385 W/(m·K), approximately twice that of aluminum. The wall thickness is reduced to 1.5 mm.');
  para(doc, '[0048] (4) The thermally conductive substrate is a direct copper bond (DCB) substrate, 1.5 mm thick, with a thermal conductivity of 385 W/(m·K).');
  para(doc, '[0049] Testing results for Example 2: After 2 hours of continuous operation at 50W, the LED junction temperature is 72°C, which is 6°C lower than Example 1. The temperature overshoot during startup is only 1°C. The maximum cooling capacity is approximately 95W.');

  para(doc, '[0050] Example 3: Small-power LED thermal management');
  para(doc, '[0051] Example 3 uses a smaller housing (80 mm × 80 mm × 18 mm) with a single Cree XHP50.2 LED chip rated at 12W. The PCM mass is 76 g. Testing shows a junction temperature of 72°C after 2 hours at 12W, which is 8°C lower than a conventional aluminum heat sink of the same size.');

  para(doc, '[0052] Example 4: No metal foam (comparative)');
  para(doc, '[0053] Example 4 is identical to Example 1 except that no metal foam structure is provided in the internal chamber. Testing shows a junction temperature of 85°C (vs. 78°C for Example 1), and the time to reach steady state after a power step from 30W to 50W is 120 seconds (vs. 30 seconds for Example 1). This demonstrates the critical role of the metal foam in enhancing internal thermal conduction.');

  doc.addPage();

  para(doc, '[0054] Comparative Example 1: Conventional aluminum heat sink');
  para(doc, '[0055] Comparative Example 1 uses an aluminum heat sink of the same outer dimensions (120 mm × 120 mm × 25 mm) with 16 integrally formed fins (height 30 mm, thickness 1.5 mm, spacing 5 mm). The heat sink is solid aluminum with no PCM. Testing shows a junction temperature of 90°C after 2 hours at 50W, a startup overshoot of 15°C, and a power step response of 15°C (vs. 8°C for Example 1).');

  para(doc, '[0056] Comparative Example 2: Heat pipe heat sink');
  para(doc, '[0057] Comparative Example 2 uses a commercial heat pipe heat sink with four 6 mm diameter copper-water heat pipes. The heat sink has outer dimensions of 130 mm × 130 mm × 45 mm. Testing shows a junction temperature of 75°C (vs. 78°C for Example 1). However, the heat pipe heat sink is 23% larger in volume, 31% heavier (680 g vs. 520 g), and 89% more expensive (\$12 vs. \$6.3) than Example 1. Additionally, the heat pipe heat sink performance degrades significantly when installed horizontally (junction temperature rises to 82°C), while Example 1 is orientation-independent.');

  doc.addPage();

  para(doc, '[0058] Table 1: Performance comparison of examples and comparative examples');
  doc.font('CJK').fontSize(9);
  const t3 = [
    ['Item', 'Ex. 1', 'Ex. 2', 'Ex. 3', 'Ex. 4\n(no foam)', 'Comp.\nEx. 1', 'Comp.\nEx. 2'],
    ['PCM type', 'Paraffin', 'Salt\nhydrate', 'Paraffin', 'Paraffin', 'None', 'None'],
    ['Housing\nmaterial', 'Al', 'Cu', 'Al', 'Al', 'Al', 'Al+Cu'],
    ['Metal foam', 'Cu 92%', 'Cu 90%', 'Cu 92%', 'None', 'N/A', 'N/A'],
    ['Junction\ntemp (°C)', '78', '72', '72', '85', '90', '75'],
    ['Startup\novershoot (°C)', '2', '1', '1', '8', '15', '5'],
    ['Power step\nrise (°C)', '8', '6', '5', '18', '15', '10'],
    ['Max cooling\n(W)', '80', '95', '25', '60', '55', '90'],
    ['Weight (g)', '520', '650', '210', '480', '450', '680'],
    ['Cost ($)', '6.3', '11', '3.2', '5.4', '4.3', '12'],
  ];
  const colW3 = 451.28 / t3[0].length;
  let sy3 = doc.y;
  t3.forEach((row, ri) => {
    const rowH = 22;
    if (sy3 + rowH > 769.89) { doc.addPage(); sy3 = 72; }
    row.forEach((cell, ci) => {
      const x = 72 + ci * colW3;
      doc.rect(x, sy3, colW3, rowH).stroke();
      doc.font('CJK').fontSize(8).text(cell, x + 2, sy3 + 4, { width: colW3 - 4, align: 'center', lineBreak: false });
    });
    sy3 += rowH;
  });
  doc.y = sy3 + 12;

  doc.addPage();

  para(doc, '[0059] Thermal design analysis:');
  para(doc, '[0060] The thermal resistance network of the device consists of the following components: R_junction = junction-to-substrate thermal resistance; R_substrate = substrate thermal resistance; R_TIM = thermal interface material resistance; R_PCM = PCM thermal resistance; R_fins = fins-to-air thermal resistance. The total thermal resistance R_ja = R_junction + R_substrate + R_TIM + R_PCM + R_fins.');
  para(doc, '[0061] For Example 1: R_junction ≈ 0.15°C/W (including eutectic solder and AlN substrate); R_substrate ≈ 0.002°C/W; R_TIM ≈ 0.003°C/W; R_PCM ≈ 0.5°C/W (with copper foam enhancement); R_fins ≈ 0.62°C/W (natural convection). Total R_ja ≈ 1.28°C/W. At 32.5W heat dissipation (50W electrical × 0.65 heat fraction), the temperature rise above ambient is 32.5 × 1.28 = 41.6°C, giving a junction temperature of 25 + 41.6 = 66.6°C. The measured value of 78°C is slightly higher due to non-uniform temperature distribution within the PCM.');
  para(doc, '[0062] The copper foam reduces the effective thermal resistance of the PCM layer from approximately 10°C/W (pure PCM) to 0.5°C/W, a 20-fold improvement. This is the key innovation that enables the PCM-based thermal management device to achieve performance comparable to heat pipe solutions at a fraction of the cost.');

  para(doc, '[0063] Reliability testing:');
  para(doc, '[0064] Example 1 was subjected to the following reliability tests:');
  para(doc, '[0065] (1) Thermal cycling: 1000 cycles from -40°C to 85°C (30 min hold at each extreme). No deformation, cracking, or PCM leakage was observed. Junction temperature at 50W was 79°C (vs. 78°C before testing), within measurement uncertainty.');
  para(doc, '[0066] (2) High-temperature aging: 1000 hours at 85°C ambient with 50W LED power. No degradation of the anodized coating or PCM decomposition was observed. Junction temperature remained stable at 77-79°C throughout the test.');
  para(doc, '[0067] (3) Humidity testing: 1000 hours at 85°C/85% RH. The sealed housing maintained its integrity with no moisture ingress. PCM performance was unchanged.');
  para(doc, '[0068] (4) Vibration testing: Random vibration 10-500 Hz, 3 Grms, 2 hours per axis. No loosening or damage was observed.');
  para(doc, '[0069] (5) Drop testing: Free drop from 1 meter onto a hard surface (concrete), one drop per face (six faces total). After testing, no cracking of the housing or fins was observed. The sealed housing maintained its integrity. Thermal performance was unchanged.');
  para(doc, '[0070] (6) Long-term PCM stability: Example 1 was operated continuously at 50W for 5000 hours (approximately 7 months). The LED junction temperature remained in the range of 77-79°C throughout the test, with no upward trend. This confirms that the PCM does not degrade or decompose during long-term operation, and the copper foam structure maintains its structural integrity within the PCM.');

  doc.addPage();

  para(doc, '[0071] PCM thermal buffer capacity analysis:');
  para(doc, '[0072] The thermal buffer capacity of the PCM can be quantified as follows. The PCM mass is m = 190 g, and the latent heat of fusion is L = 250 kJ/kg. The total latent heat that can be absorbed is Q_latent = m × L = 0.19 kg × 250 kJ/kg = 47.5 kJ.');
  para(doc, '[0073] During LED startup from cold state to steady state, the LED heat generation rate increases from 0 to 32.5W over approximately 30 seconds. The average heat generation rate during startup is approximately 16.25W, and the total heat generated during startup is Q_startup = 16.25W × 30s = 487.5 J = 0.4875 kJ. This is only about 1% of the total latent heat capacity (47.5 kJ), confirming that the PCM has ample capacity for startup thermal buffering.');
  para(doc, '[0074] The time required to fully melt the PCM (assuming all latent heat is absorbed) is t_melt = Q_latent / Q = 47500 J / 32.5 W = 1462 seconds ≈ 24 minutes. This means the PCM can provide thermal buffering for approximately 24 minutes of continuous full-power operation before transitioning from the solid-liquid coexistence regime to the fully liquid regime.');
  para(doc, '[0075] During the solid-liquid coexistence regime (phase change period), the housing inner wall temperature is "clamped" near the PCM melting point (55°C). This temperature clamping effect is the primary mechanism by which the PCM reduces temperature fluctuations. After the PCM is fully melted, the thermal management relies on natural convection within the liquid PCM and the cooling fins, and the device behaves more like a conventional heat sink with a large thermal mass.');

  doc.addPage();

  para(doc, '[0069] Application scenarios:');
  para(doc, '[0070] The thermal management device of the present invention is suitable for the following applications:');
  para(doc, '[0071] (1) Indoor high-power LED lighting: LED downlights, panel lights, and high-bay lights, power range 30-200W. The PCM thermal buffering effectively suppresses temperature transients during on/off switching, extending LED lifetime in intelligent lighting systems with frequent switching.');
  para(doc, '[0072] (2) Outdoor LED street and tunnel lights: power range 100-400W, operating in ambient temperatures from -40°C to +50°C. The PCM melting point can be adjusted by varying the composition to suit different climate conditions. The anodized anti-corrosion coating protects against rain and salt spray.');
  para(doc, '[0073] (3) Automotive LED headlamps: power range 10-50W, operating in harsh vibration and temperature environments. The passive, maintenance-free nature of the device is particularly suitable for automotive applications. Reliability testing confirms long-term stability under automotive conditions.');
  para(doc, '[0074] (4) LED display backlighting: large-format LED TV and monitor backlight units, power range 50-150W. The PCM provides uniform temperature distribution, preventing brightness non-uniformity and color shift caused by localized hot spots.');
  para(doc, '[0075] (5) Specialty LED lighting: stage lighting, film/video lighting, and horticultural lighting, power range 100-500W. The large-area PCM layer provides excellent temperature uniformity, meeting the stringent requirements of specialty lighting applications.');

  para(doc, '[0076] The inventors declare that the above description represents preferred embodiments of the invention and does not limit the scope of the invention. Any modifications, equivalent replacements, or improvements made within the spirit and principles of the present invention shall be included within the scope of protection.');

  doc.addPage();

  heading(doc, 'ABSTRACT', 14);
  doc.moveDown(1);
  para(doc, 'A thermal management device for semiconductor light sources includes a sealed housing containing a phase change material, a porous metal foam structure, a thermally conductive substrate, and integrally formed cooling fins. The phase change material absorbs heat through phase transition, providing thermal buffering and reducing temperature fluctuations. The porous metal foam enhances internal thermal conduction. The device has no moving parts, requires no maintenance, and provides efficient passive cooling for high-power LED applications.');
  doc.moveDown(2);
  doc.font('CJK').fontSize(10).text('[FIG. 1]', { align: 'center' });

  doc.addPage();

  heading(doc, 'ABSTRACT DRAWING DESCRIPTION', 14);
  doc.moveDown(1);
  para(doc, 'FIG. 1 is a perspective view of the thermal management device according to the present invention. Reference numerals: 1-sealed housing; 2-phase change material; 3-thermally conductive substrate; 4-LED chip; 6-cooling fins; 7-porous metal foam; 8-evacuation valve.');

  doc.end();
  console.log('D3 PDF generated');
}

// Generate all three
generateD1();
generateD2();
generateD3();

console.log('All comparison PDFs generated.');
