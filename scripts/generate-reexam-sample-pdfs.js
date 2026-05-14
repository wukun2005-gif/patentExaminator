/**
 * 生成复审场景 sample PDF：审查意见通知书 + 意见陈述书
 * 基于 G1-LED 散热装置案例构造
 * 用法: node scripts/generate-reexam-sample-pdfs.js
 */
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..", "samples", "led-heatsink");
const FONT = "/Library/Fonts/Arial Unicode.ttf"; // macOS CJK 字体

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const ML = 72,
  MR = 72,
  MT = 72,
  MB = 72;

// ── 审查意见通知书 ──────────────────────────────────────

function genOfficeAction() {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MT, bottom: MB, left: ML, right: MR },
    info: {
      Title: "第一次审查意见通知书",
      Author: "国家知识产权局",
      Subject: "专利申请审查意见通知书"
    }
  });
  doc.registerFont("CJK", FONT);
  doc.pipe(fs.createWriteStream(path.join(BASE, "第一次审查意见通知书.pdf")));

  doc
    .font("CJK")
    .fontSize(16)
    .text("第一次审查意见通知书", { align: "center" });
  doc.moveDown(2);

  doc.fontSize(11).text("申请号：202410123456.7");
  doc.text("发明创造名称：一种LED散热装置");
  doc.text("申请人：深圳光明科技有限公司");
  doc.moveDown(1);
  doc.text("审查员：张三");
  doc.text("发文日：2024-08-15");
  doc.moveDown(2);

  doc.fontSize(13).text("一、关于新颖性", { underline: true });
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .text(
      "权利要求1请求保护一种LED散热装置。对比文件D1（CN108XXXXXXA，公开日2022-06-15）公开了一种散热器（参见说明书第[0005]-[0006]段），包括铝合金基板和设置于基板上表面的散热翅片。权利要求1与D1相比，D1已公开了特征A（铝合金基板）和特征B（散热翅片设置于基板上表面），因此权利要求1相对于D1不具备专利法第22条第2款规定的新颖性。",
      { align: "justify", lineGap: 4 }
    );
  doc.moveDown(1);

  doc
    .fontSize(13)
    .text("二、关于创造性", { underline: true });
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .text(
      "即使认为权利要求1与D1之间存在区别特征（一体成型工艺和纳米涂层），该区别特征也不足以使权利要求1具备创造性。D2（CN109XXXXXXB）公开了在散热结构中采用石墨烯导热膜以提高散热效率（参见说明书第[0008]段）。本领域技术人员在D1的基础上，为了提高散热效率，有动机将D2公开的导热膜技术应用于D1的散热装置中，从而获得权利要求1所述的技术方案。因此，权利要求1相对于D1和D2的结合不具备专利法第22条第3款规定的创造性。",
      { align: "justify", lineGap: 4 }
    );
  doc.moveDown(1);

  doc
    .fontSize(13)
    .text("三、关于清楚性", { underline: true });
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .text(
      "从属权利要求2和3的引用关系不明确。权利要求2引用了权利要求1，但其附加技术特征'所述散热翅片数量为8-16片'与权利要求1中已记载的散热翅片结构之间的关系未清楚限定。权利要求3的引用关系也存在类似问题。上述缺陷不符合专利法第26条第4款的规定。",
      { align: "justify", lineGap: 4 }
    );
  doc.moveDown(1);

  doc
    .fontSize(13)
    .text("四、审查意见结论", { underline: true });
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .text(
      "综上所述，本申请目前尚不具备授权条件。申请人应在收到本通知书之日起4个月内陈述意见或修改申请文件。如逾期不答复，本申请将被视为撤回。",
      { align: "justify", lineGap: 4 }
    );
  doc.moveDown(2);

  doc
    .fontSize(10)
    .text(
      "国家知识产权局（盖章）",
      { align: "right" }
    );
  doc.text("2024年8月15日", { align: "right" });

  doc.end();
  console.log("Generated: 第一次审查意见通知书.pdf");
}

// ── 意见陈述书 ──────────────────────────────────────────

function genOfficeActionResponse() {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MT, bottom: MB, left: ML, right: MR },
    info: {
      Title: "意见陈述书",
      Author: "深圳光明科技有限公司",
      Subject: "专利申请意见陈述书"
    }
  });
  doc.registerFont("CJK", FONT);
  doc.pipe(fs.createWriteStream(path.join(BASE, "意见陈述书.pdf")));

  doc
    .font("CJK")
    .fontSize(16)
    .text("意见陈述书", { align: "center" });
  doc.moveDown(2);

  doc.fontSize(11).text("申请号：202410123456.7");
  doc.text("发明创造名称：一种LED散热装置");
  doc.text("申请人：深圳光明科技有限公司");
  doc.text("代理人：李四");
  doc.text("提交日：2024-11-20");
  doc.moveDown(2);

  doc
    .fontSize(13)
    .text("尊敬的审查员：", { underline: false });
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .text(
      "申请人认真研究了贵局于2024年8月15日发出的第一次审查意见通知书，现陈述意见如下：",
      { align: "justify", lineGap: 4 }
    );
  doc.moveDown(1);

  // R1 response
  doc
    .fontSize(13)
    .text("一、关于新颖性驳回理由的答辩", { underline: true });
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .text(
      "申请人认为，D1（CN108XXXXXXA）并未公开本申请权利要求1的全部技术特征。具体而言：",
      { align: "justify", lineGap: 4 }
    );
  doc.text(
    "本申请权利要求1明确限定'散热翅片与基板一体成型'，且根据说明书第[0007]段的记载，一体成型采用'铝合金压铸一次成型'工艺，翅片高度为15-30mm。D1第[0006]段记载的是'散热翅片通过焊接工艺与基板连接'。焊接属于分体组装工艺，与一体压铸成型工艺存在本质区别。",
    { align: "justify", indent: 24, lineGap: 4 }
  );
  doc.text(
    "为进一步明确该区别特征，申请人对权利要求1进行了修改，将原'散热翅片与基板一体成型'进一步限定为'散热翅片与基板通过压铸一体成型工艺制成，翅片间距2-5mm'。该区别特征在D1中确未公开。",
    { align: "justify", indent: 24, lineGap: 4 }
  );
  doc.moveDown(1);

  // R2 response
  doc
    .fontSize(13)
    .text("二、关于创造性驳回理由的答辩", { underline: true });
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .text(
      "关于审查意见中引用的D2（CN109XXXXXXB），申请人认为D2与D1之间不存在结合的技术启示，理由如下：",
      { align: "justify", lineGap: 4 }
    );
  doc.text(
    "1. 技术领域不同：D2主要应用于CPU散热场景（参见D2第[0001]段），而本申请涉及LED灯具的散热技术领域。CPU散热与LED灯具散热的工作温度区间、散热功率密度、结构空间约束均有显著差异。",
    { align: "justify", indent: 24, lineGap: 4 }
  );
  doc.text(
    "2. 缺乏技术启示：D2公开的石墨烯导热膜厚度为0.01-0.05mm，用于填充CPU芯片与散热器之间的微观间隙。而本申请修改后的权利要求1限定了翅片间距2-5mm，该间距参数与石墨烯导热膜厚度的配合关系在D1和D2中均未涉及。本领域技术人员在D1和D2的基础上，不会想到将D2的CPU散热方案应用于D1的LED散热装置，并进一步调整翅片间距以获得本申请的技术方案。",
    { align: "justify", indent: 24, lineGap: 4 }
  );
  doc.moveDown(1);

  // R3 note
  doc
    .fontSize(13)
    .text("三、关于清楚性驳回理由的说明", { underline: true });
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .text(
      "关于审查意见中指出的权利要求2和3引用关系不明确的问题，申请人将在后续补正中对引用关系进行修正。",
      { align: "justify", lineGap: 4 }
    );
  doc.moveDown(1);

  // Conclusion
  doc
    .fontSize(13)
    .text("四、结语", { underline: true });
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .text(
      "综上所述，申请人认为修改后的权利要求1具备专利法第22条第2款规定的新颖性和第22条第3款规定的创造性。恳请审查员在考虑以上陈述和修改后，予以重新审查。",
      { align: "justify", lineGap: 4 }
    );
  doc.moveDown(2);

  doc
    .fontSize(10)
    .text(
      "深圳光明科技有限公司（盖章）",
      { align: "right" }
    );
  doc.text("代理人：李四", { align: "right" });
  doc.text("2024年11月20日", { align: "right" });

  doc.end();
  console.log("Generated: 意见陈述书.pdf");
}

// ── 修改后权利要求书（独立文件，可选） ──────────────────

function genAmendedClaims() {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MT, bottom: MB, left: ML, right: MR },
    info: {
      Title: "修改后权利要求书",
      Author: "深圳光明科技有限公司",
      Subject: "权利要求书（修改后）"
    }
  });
  doc.registerFont("CJK", FONT);
  doc.pipe(
    fs.createWriteStream(path.join(BASE, "修改后权利要求书.pdf"))
  );

  doc
    .font("CJK")
    .fontSize(16)
    .text("权利要求书（修改后）", { align: "center" });
  doc.moveDown(2);

  doc
    .fontSize(11)
    .text(
      "1. 一种LED散热装置，其特征在于，包括：基板，所述基板为铝合金材质，厚度为2-5mm；散热翅片，设置在所述基板上表面，所述散热翅片与所述基板通过压铸一体成型工艺制成，翅片间距2-5mm；所述散热翅片表面设置有纳米涂层。",
      { align: "justify", lineGap: 4 }
    );
  doc.moveDown(1);

  doc.text(
    "2. 根据权利要求1所述的LED散热装置，其特征在于，所述散热翅片数量为8-16片，均匀分布在所述基板上表面。",
    { align: "justify", lineGap: 4 }
  );
  doc.moveDown(1);

  doc.text(
    "3. 根据权利要求1所述的LED散热装置，其特征在于，所述纳米涂层为碳化硅涂层，涂层厚度为0.1-0.3mm。",
    { align: "justify", lineGap: 4 }
  );
  doc.moveDown(1);

  doc.text(
    "4. 根据权利要求1所述的LED散热装置，其特征在于，所述基板下表面设置有LED安装区域，所述安装区域面积占基板下表面面积的30%-50%。",
    { align: "justify", lineGap: 4 }
  );

  doc.end();
  console.log("Generated: 修改后权利要求书.pdf");
}

genOfficeAction();
genOfficeActionResponse();
genAmendedClaims();
console.log("Done. All reexamination sample PDFs generated in samples/led-heatsink/");
