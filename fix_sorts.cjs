const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

const regex = /\.sort\(\(a(:\s*any)?, b(:\s*any)?\) => \{\s*const timeA = a\.timestamp instanceof Date \? a\.timestamp : new Date\(a\.timestamp\);\s*const timeB = b\.timestamp instanceof Date \? b\.timestamp : new Date\(b\.timestamp\);\s*return timeB\.getTime\(\) - timeA\.getTime\(\);\s*\}\)/g;

const replacement = `.sort((a,b) => {
    const timeA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
    const timeB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    const timeDiff = timeB.getTime() - timeA.getTime();
    if (timeDiff !== 0) return timeDiff;
    const aId = a.firebaseKey || a.id || "";
    const bId = b.firebaseKey || b.id || "";
    return bId.localeCompare(aId);
  })`;

let count = 0;
content = content.replace(regex, (match) => {
  count++;
  const matchLines = match.split('\n');
  const indent = matchLines[0].match(/^\s*/)[0];
  return replacement.split('\n').map((line, i) => i === 0 ? line : indent + line.trim()).join('\n');
});

console.log("Replaced sort orders:", count);
fs.writeFileSync('src/App.tsx', content);
