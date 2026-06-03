const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

const target = `{activeTab === "laporan" && (`;

const insertion = `{activeTab === "kuesioner" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTab("beranda")}
                  className="h-8 w-8 flex items-center justify-center rounded-full bg-white border border-[#3D2B1F]/5 shadow-sm"
                >
                  <ArrowLeft size={16} />
                </button>
                <h2 className="text-xl font-bold text-[#3D2B1F]">
                  Hasil Kuesioner
                </h2>
              </div>
            </div>

            <div className="space-y-4">
              {feedbacks
                .filter((f) => f.type === "Kuesioner")
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                .map((item, idx) => {
                  let kData = {};
                  try {
                    kData = JSON.parse(item.comment);
                  } catch (e) {}

                  return (
                    <div
                      key={idx}
                      className="bg-white p-5 rounded-[2rem] shadow-sm border border-[#3D2B1F]/5 relative"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-bold text-[#3D2B1F]">
                            {item.userName || "Pelanggan"}
                          </h4>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-[#3D2B1F]/40 font-bold">
                            {item.timestamp.toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                          <button
                            onClick={() =>
                              setFeedbackToDelete({
                                id: item.id,
                                type: item.type,
                              })
                            }
                            className="text-red-400 hover:text-red-600 transition-colors"
                            title="Hapus Kuesioner"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="text-sm text-[#3D2B1F]/80 space-y-2 mt-4">
                         {Object.entries(kData).map(([k, v]) => (
                            <div key={k} className="bg-[#F5F2EA] p-3 rounded-xl">
                              <span className="block text-xs font-bold text-[#3D2B1F]/60 uppercase tracking-wide mb-1 flex items-center gap-2">
                                 {k === 'q1' && "1. Mudah Menemukan Menu"}
                                 {k === 'q2' && "2. Tampilan & Desain"}
                                 {k === 'q3' && "3. Kejelasan Harga"}
                                 {k === 'q4' && "4. Kendala Teknis"}
                                 {k === 'q5' && "5. Alur Pemesanan"}
                                 {k === 'q6' && "6. Saran & Masukan"}
                              </span>
                              <p className="font-medium text-[#3D2B1F]">{String(v)}</p>
                            </div>
                         ))}
                      </div>
                    </div>
                  );
                })}
              {feedbacks.filter((f) => f.type === "Kuesioner").length === 0 && (
                <div className="text-center py-12">
                  <div className="h-16 w-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4 text-stone-400">
                    <ClipboardList size={32} />
                  </div>
                  <p className="text-sm font-bold text-[#3D2B1F]/40">
                    Belum ada kuesioner masuk
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        `;

content = content.replace(target, insertion + target);

// Also we should filter out Kuesioner from "rating" tab
const targetRatingCombine = `                ...feedbacks.map((f) => ({
                  id: f.id || "",
                  type: (f.type || "Aplikasi") as any,
                  name: f.userName || "Pelanggan",
                  rating: f.rating || 0,
                  comment: f.comment || "",
                  timestamp: f.timestamp ? new Date(f.timestamp) : new Date(),
                })),`;

const replaceRatingCombine = `                ...feedbacks
                  .filter(f => f.type !== "Kuesioner")
                  .map((f) => ({
                    id: f.id || "",
                    type: (f.type || "Aplikasi") as any,
                    name: f.userName || "Pelanggan",
                    rating: f.rating || 0,
                    comment: f.comment || "",
                    timestamp: f.timestamp ? new Date(f.timestamp) : new Date(),
                  })),`;

content = content.replace(targetRatingCombine, replaceRatingCombine);

fs.writeFileSync('src/App.tsx', content);
