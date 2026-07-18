// Trigger-image quality analysis: compiles the image with the MindAR Compiler
// (same engine the AR viewer uses) and turns the extracted feature data into an
// artist-facing score, so weak images are caught at upload time, not at the venue.
import { Compiler } from '../../spike/vendor/mindar-image.prod.js';

const GOOD_FEATURES = 250;
const OK_FEATURES = 90;

function countFeatures(data) {
  let matching = 0;
  for (const kf of data.matchingData || []) {
    matching += (kf.maximaPoints?.length || 0) + (kf.minimaPoints?.length || 0);
  }
  let tracking = 0;
  for (const t of data.trackingData || []) {
    tracking += t.points?.length || 0;
  }
  return { matching, tracking };
}

export async function analyzeTriggerImage(img, onProgress) {
  const compiler = new Compiler();
  const t0 = performance.now();
  const dataList = await compiler.compileImageTargets([img], (p) => onProgress?.(p));
  const seconds = (performance.now() - t0) / 1000;
  const stats = countFeatures(dataList[0]);
  const featureTotal = stats.matching + stats.tracking;

  let grade, score;
  if (featureTotal >= GOOD_FEATURES) {
    grade = 'good';
    score = Math.min(100, 70 + Math.round((featureTotal - GOOD_FEATURES) / 20));
  } else if (featureTotal >= OK_FEATURES) {
    grade = 'medium';
    score = 40 + Math.round(((featureTotal - OK_FEATURES) / (GOOD_FEATURES - OK_FEATURES)) * 30);
  } else {
    grade = 'poor';
    score = Math.max(5, Math.round((featureTotal / OK_FEATURES) * 40));
  }

  const tips = [];
  if (grade !== 'good') {
    tips.push('הוסיפו ניגודיות: אזורים כהים ובהירים זה לצד זה נקלטים הרבה יותר טוב.');
    tips.push('הוסיפו פרטים קטנים ולא-חוזרים על פני כל התמונה — רקע אחיד או דוגמה חוזרת קשים לזיהוי.');
    tips.push('הימנעו משטחי צבע גדולים וחלקים ומטקסט דק בלבד.');
  }

  return {
    score, grade, stats, seconds,
    mindBuffer: compiler.exportData(),
  };
}
