const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

const regex = /const timeA = a\.timestamp instanceof Date \? a\.timestamp : new Date\(a\.timestamp\);\s*const timeB = b\.timestamp instanceof Date \? b\.timestamp : new Date\(b\.timestamp\);\s*const dateA = new Date\(timeA\.getFullYear\(\), timeA\.getMonth\(\), timeA\.getDate\(\)\)\.getTime\(\);\s*const dateB = new Date\(timeB\.getFullYear\(\), timeB\.getMonth\(\), timeB\.getDate\(\)\)\.getTime\(\);\s*if \(dateA !== dateB\) return dateB - dateA;\s*const numA = parseInt\(a\.orderNumber \|\| '0', 10\);\s*const numB = parseInt\(b\.orderNumber \|\| '0', 10\);\s*if \(!isNaN\(numA\) && !isNaN\(numB\) && numA !== numB\) return numB - numA;\s*return timeB\.getTime\(\) - timeA\.getTime\(\);/g;

const replacement = `const timeA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
const timeB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
return timeB.getTime() - timeA.getTime();`;

let count = 0;
content = content.replace(regex, (match) => {
  count++;
  const matchLines = match.split('\n');
  const indent = matchLines[0].match(/^\s*/)[0];
  
  return replacement.split('\n').map((line, i) => i === 0 ? line : indent + line.trim()).join('\n');
});

console.log(`Replaced ${count} occurrences`);
fs.writeFileSync('src/App.tsx', content);
