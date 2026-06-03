const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(/className="w-5 h-5 text-\[#3D2B1F\] border-\[#3D2B1F\]\/30 focus:ring-\[#3D2B1F\] focus:ring-offset-0 bg-white"/g, 'className="w-5 h-5 accent-[#3D2B1F] cursor-pointer"');

fs.writeFileSync('src/App.tsx', content);
