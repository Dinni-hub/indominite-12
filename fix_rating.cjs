const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

const target = `
                ...feedbacks.map((f) => ({
                  id: f.id || "",
                  type: "Aplikasi" as "Order" | "Aplikasi",
                  name: f.userName || "Pelanggan",
                  rating: f.rating || 0,
                  comment: f.comment || "",
                  timestamp: f.timestamp ? new Date(f.timestamp) : new Date(),
                })),
`;

const replacement = `
                ...feedbacks.map((f) => ({
                  id: f.id || "",
                  type: (f.type || "Aplikasi") as any,
                  name: f.userName || "Pelanggan",
                  rating: f.rating || 0,
                  comment: f.comment || "",
                  timestamp: f.timestamp ? new Date(f.timestamp) : new Date(),
                })),
`;

content = content.replace(target, replacement);

const targetRender = `
                      <div className="mt-3 p-4 bg-[#F5F2EA] rounded-xl">
                        <p className="text-sm text-[#3D2B1F]/80 italic">
                          "{item.comment}"
                        </p>
                      </div>
`;

// Wait, I didn't verify the exact code of targetRender, so I'll just use a regex.
content = content.replace(/<p className="text-sm text-\[#3D2B1F]\/80 italic">\s*"\{item\.comment\}"\s*<\/p>/g, 
  `{item.type === "Kuesioner" ? (
      <div className="text-sm text-[#3D2B1F]/80 space-y-2">
         {Object.entries(JSON.parse(item.comment)).map(([k, v]) => (
            <p key={k}><strong>{k}:</strong> {String(v)}</p>
         ))}
      </div>
  ) : (
      <p className="text-sm text-[#3D2B1F]/80 italic">
         "{item.comment}"
      </p>
  )}`);

fs.writeFileSync('src/App.tsx', content);
