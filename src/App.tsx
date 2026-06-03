/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { storage, db, auth, googleProvider } from "./services/firebaseService";
import Papa from "papaparse";
import { GoogleGenAI, Type } from "@google/genai";
import Markdown from "react-markdown";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  writeBatch,
  serverTimestamp,
  getDocFromServer,
  increment,
  deleteField,
  runTransaction,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  signInAnonymously,
} from "firebase/auth";
import {
  Bell,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Flame,
  Utensils,
  Soup,
  IceCream,
  Star,
  Clock,
  Bike,
  Home,
  ReceiptText,
  User,
  ArrowLeft,
  MapPin,
  Wallet,
  CreditCard,
  CheckCircle,
  XCircle,
  Circle,
  ShoppingBag,
  Minus,
  Plus,
  QrCode,
  Banknote,
  ChevronRight,
  Settings,
  Lock,
  Phone,
  Mail,
  HelpCircle,
  LogOut,
  LogIn,
  Trash2,
  BellRing,
  Bird,
  Cookie,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  ShoppingCart,
  LayoutDashboard,
  AlertCircle,
  Package,
  Egg,
  Leaf,
  Box,
  Droplet,
  Sparkles,
  X,
  Coffee,
  Camera,
  Edit,
  Download,
  Pencil,
  UploadCloud,
  CheckSquare,
  Square,
  Beef,
  Check,
  Calendar,
  Image as ImageIcon,
  FileText,
  Paperclip,
  FileImage,
  ClipboardList,
  Play,
} from "lucide-react";
import { BottomNav, NavItem } from "./components/BottomNav";

type View = "welcome" | "home" | "detail" | "checkout" | "orders" | "owner";

interface CartItem {
  item: any;
  quantity: number;
  toppings: string[];
  accumulatedToppings?: string[];
  totalPrice: number;
  notes?: string;
}

interface Order {
  id: string;
  orderNumber?: string;
  firebaseKey?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  paymentMethod?: string;
  items: CartItem[];
  total: number;
  notes?: string;
  timestamp: Date;
  status: "diterima" | "dimasak" | "diantar" | "selesai" | "dibatalkan";
  paymentStatus: "belum" | "lunas";
  rating?: number;
  feedback?: string;
  appRating?: number;
  appFeedback?: string;
  sessionId?: string;
  uid?: string | null;
  isManual?: boolean;
  manualProfit?: number;
  calculatedProfit?: number;
  isReadyForNotify?: boolean;
  isDeleted?: boolean;
  isDemo?: boolean;
  attachmentUrl?: string;
  attachmentType?: "image" | "file";
  attachmentName?: string;
  fileUrl?: string;
}

export const getSequentialOrderNumber = (order: Order, orders: Order[]) => {
  const orderDateStr = (
    order.timestamp instanceof Date
      ? order.timestamp
      : new Date(order.timestamp)
  ).toDateString();
  const sameDayOrders = orders.filter((o) => {
    if (o.isDeleted) return false;
    const isSameDay =
      (o.timestamp instanceof Date
        ? o.timestamp
        : new Date(o.timestamp)
      ).toDateString() === orderDateStr;
    return isSameDay;
  });

  sameDayOrders.sort((a, b) => {
    const timeA =
      a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
    const timeB =
      b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    const timeDiff = timeA.getTime() - timeB.getTime();
    if (timeDiff !== 0) return timeDiff;
    const aId = a.firebaseKey || a.id || "";
    const bId = b.firebaseKey || b.id || "";
    return aId.localeCompare(bId);
  });

  const index = sameDayOrders.findIndex(
    (o) =>
      (o.firebaseKey && o.firebaseKey === order.firebaseKey) ||
      o.id === order.id,
  );
  if (index === -1) return "01";
  return String(index + 1).padStart(2, "0");
};

export const getTransactionHistoryNumber = (order: Order, orders: Order[]) => {
  const completedOrCancelled = orders.filter(
    (o) => (o.status === "selesai" || o.status === "dibatalkan") && !o.isDeleted,
  );

  completedOrCancelled.sort((a, b) => {
    const timeA =
      a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
    const timeB =
      b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    const timeDiff = timeA.getTime() - timeB.getTime();
    if (timeDiff !== 0) return timeDiff;
    const aId = a.firebaseKey || a.id || "";
    const bId = b.firebaseKey || b.id || "";
    return aId.localeCompare(bId);
  });

  const index = completedOrCancelled.findIndex(
    (o) =>
      (o.firebaseKey && o.firebaseKey === order.firebaseKey) ||
      o.id === order.id,
  );
  if (index === -1) return "01";
  return String(index + 1).padStart(2, "0");
};

interface AppFeedback {
  id?: string;
  type?: string;
  rating: number;
  comment: string;
  timestamp: Date;
  userName?: string;
  userEmail?: string;
}

const getNextOrderNumber = async (
  isFirebaseConfigured: boolean,
  orders: Order[],
  targetDate: Date = new Date(),
) => {
  let nextNumber = 1;

  // Create a YYYY-MM-DD string for the target date (local timezone)
  const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;

  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  console.log("Generating next order number for:", dateStr);

  const getLocalNextNumber = () => {
    const todayOrders = orders.filter((o) => {
      if (!o.timestamp) return false;
      const orderTime =
        o.timestamp instanceof Date
          ? o.timestamp
          : typeof (o.timestamp as any).toDate === "function"
            ? (o.timestamp as any).toDate()
            : new Date(o.timestamp);
      return (
        !isNaN(orderTime.getTime()) &&
        orderTime >= dayStart &&
        orderTime <= dayEnd
      );
    });
    if (todayOrders.length > 0) {
      const maxOrderNumber = Math.max(
        ...todayOrders.map((o) => {
          if (!o.orderNumber) return 0;
          const clean = o.orderNumber.toString().replace(/[^0-9]/g, "");
          return parseInt(clean, 10) || 0;
        }),
      );
      return maxOrderNumber + 1;
    }
    return 1;
  };

  if (isFirebaseConfigured) {
    let retries = 0;
    while (retries < 5) {
      try {
        const counterRef = doc(db, "counters", dateStr);
        const newNum = await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);

          if (!counterDoc.exists()) {
            const currentMax = getLocalNextNumber() - 1;
            const startNum = Math.max(0, currentMax) + 1;
            transaction.set(counterRef, { count: startNum });
            return startNum;
          }

          const currentCount = counterDoc.data().count || 0;
          const newCount = currentCount + 1;
          transaction.update(counterRef, { count: newCount });
          return newCount;
        });
        nextNumber = newNum;
        break; // Success, exit retry loop
      } catch (err: any) {
        retries++;
        console.error(
          `Error with transaction for order number (Attempt ${retries}):`,
          err,
        );
        if (retries >= 5) {
          // If all retries fail, check if we can safely calculate locally.
          // Fallback to local calculation only after max retries
          nextNumber = getLocalNextNumber();
        } else {
          // Wait before retrying, increasing delay each time
          await new Promise((resolve) => setTimeout(resolve, 1500 * retries));
        }
      }
    }
  } else {
    nextNumber = getLocalNextNumber();
  }

  return nextNumber.toString().padStart(2, "0");
};

const OWNER_WHATSAPP_NUMBER = "628123456789"; // GANTI DENGAN NOMOR WA OWNER (Gunakan kode negara, misal 628...)

enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

const getGroupedItems = (items: CartItem[]) => {
  if (!items || !Array.isArray(items)) return [];
  const grouped: CartItem[] = [];
  items
    .filter((i) => i && i.item)
    .forEach((item) => {
      const existing = grouped.find(
        (g) =>
          g.item.id === item.item.id &&
          JSON.stringify([...(g.toppings || [])].sort()) ===
            JSON.stringify([...(item.toppings || [])].sort()) &&
          g.notes === item.notes,
      );
      if (existing) {
        existing.quantity += item.quantity;
        existing.totalPrice += item.totalPrice;
        existing.accumulatedToppings = [
          ...(existing.accumulatedToppings || existing.toppings || []),
          ...(item.toppings || []),
        ];
      } else {
        grouped.push({
          ...item,
          toppings: [...(item.toppings || [])],
          accumulatedToppings: [...(item.toppings || [])],
        });
      }
    });
  return grouped;
};

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // If it's a permission error and we are in owner mode but anonymous, don't crash the app
  if (
    errorMessage.includes("insufficient permissions") ||
    errorMessage.includes("permission-denied")
  ) {
    console.warn(
      `Firestore Permission Denied: ${operationType} on ${path}. User might need to login.`,
    );
    return; // Don't throw, just log it
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<
  any,
  { hasError: boolean; error: any }
> {
  state = { hasError: false, error: null };
  props: any;
  constructor(props: any) {
    super(props);
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Terjadi kesalahan pada aplikasi.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error && parsed.error.includes("insufficient permissions")) {
          errorMessage =
            "Maaf, Anda tidak memiliki izin untuk melakukan operasi ini.";
        }
      } catch (e) {
        // Not a JSON error
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-100 p-6">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-stone-900 mb-4">
              Ups! Ada Masalah
            </h2>
            <p className="text-stone-600 mb-8">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-[#3D2B1F] text-white rounded-2xl font-bold shadow-lg"
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const DEFAULT_INVENTORY = [
  {
    id: 1,
    name: "Indomie Goreng Klasik",
    stock: 15,
    unit: "bks",
    max: 100,
    min: 5,
    icon: "Package",
    color: "bg-orange-100 text-orange-600",
    imageUrl:
      "https://raw.githubusercontent.com/Dinni-hub/indomi-goreng-bungkus/main/Indomie%20goreng%201%20bungkus%2085%20gram%20_%20indomie%20_%20mie%20goreng%20indomie.jpg",
  },
  {
    id: 10,
    name: "Indomie Soto Kuah",
    stock: 20,
    unit: "bks",
    max: 100,
    min: 5,
    icon: "Package",
    color: "bg-yellow-100 text-yellow-600",
    imageUrl:
      "https://raw.githubusercontent.com/Dinni-hub/indomi-goreng/main/INDOMIE%20SOTO%20KOYA%20NAGIH%2076%20GR.jpg",
  },
  {
    id: 11,
    name: "Indomie Rendang",
    stock: 20,
    unit: "bks",
    max: 100,
    min: 5,
    icon: "Package",
    color: "bg-orange-100 text-orange-600",
    imageUrl:
      "https://raw.githubusercontent.com/Dinni-hub/indomi-goreng/main/Indomie%20Goreng%20Rendang%20Maknyoossss.jpg",
  },
  {
    id: 2,
    name: "Telur",
    stock: 42,
    unit: "biji",
    max: 100,
    min: 1,
    icon: "Egg",
    color: "bg-amber-100 text-amber-600",
    imageUrl:
      "https://raw.githubusercontent.com/Dinni-hub/manajemen-stok/main/Telur%20Ayam%20Organik%20Nature%20Eggs%20%20(10%20pcs%20_%20pack).jpg",
  },
  {
    id: 9,
    name: "Sosis",
    stock: 50,
    unit: "pcs",
    max: 200,
    min: 10,
    icon: "Beef",
    color: "bg-red-100 text-red-600",
    imageUrl:
      "https://raw.githubusercontent.com/Dinni-hub/sosis/main/download%20(9).jpg",
  },
  {
    id: 3,
    name: "Minyak",
    stock: 5,
    unit: "ltr",
    max: 20,
    min: 1,
    icon: "Droplet",
    color: "bg-yellow-100 text-yellow-600",
    imageUrl:
      "https://raw.githubusercontent.com/Dinni-hub/manajemen-stok/main/TROPICAL%20MINYAK%20GORENG%20%202000mL.jpg",
  },
  {
    id: 7,
    name: "Saus Tomat",
    stock: 2,
    unit: "btl",
    max: 5,
    min: 1,
    icon: "Droplet",
    color: "bg-red-50 text-red-500",
    imageUrl:
      "https://raw.githubusercontent.com/Dinni-hub/manajemen-stok/main/INDOFOOD%20TOMATO%20SAUCE%20SAUS%20TOMAT%20BOTOL%20275ML.jpg",
  },
  {
    id: 8,
    name: "Saus Sambal",
    stock: 3,
    unit: "btl",
    max: 5,
    min: 1,
    icon: "Droplet",
    color: "bg-orange-50 text-orange-500",
    imageUrl:
      "https://raw.githubusercontent.com/Dinni-hub/manajemen-stok/main/INDOFOOD%20Sambal%20Pedas%20275ml%20ACCJKT.jpg",
  },
  {
    id: 5,
    name: "Packaging Box Kertas",
    stock: 30,
    unit: "pcs",
    max: 200,
    min: 10,
    icon: "Box",
    color: "bg-stone-100 text-stone-600",
    imageUrl:
      "https://raw.githubusercontent.com/Dinni-hub/manajemen-stok/main/MSP%20~%20LUNCH%20BOX%20_%20PAPER%20BOX%20COKELAT%20M%26L%20_50PCS%20_%20S%20100PCS.jpg",
  },
  {
    id: 13,
    name: "Bowl",
    stock: 50,
    unit: "pcs",
    max: 200,
    min: 20,
    icon: "Soup",
    color: "bg-stone-100 text-stone-600",
    imageUrl:
      "https://raw.githubusercontent.com/Dinni-hub/indomi-goreng/main/Paper%20bowl.jpg",
  },
  {
    id: 12,
    name: "Plastik",
    stock: 100,
    unit: "pcs",
    max: 500,
    min: 50,
    icon: "Package",
    color: "bg-blue-100 text-blue-600",
    imageUrl:
      "https://raw.githubusercontent.com/Dinni-hub/indomi-goreng/main/PLASTIK%20PE%20ukuran%209x18cm_%20PLASTIK%20ES%20ukuran%20isi%20200gram.jpg",
  },
  {
    id: 14,
    name: "Sendok",
    stock: 50,
    unit: "pcs",
    max: 200,
    min: 20,
    icon: "Utensils",
    color: "bg-slate-100 text-slate-600",
    imageUrl:
      "https://raw.githubusercontent.com/Dinni-hub/indomi-goreng/main/White%20Feeding%20Spoon.jpg",
  },
  {
    id: 6,
    name: "Garpu",
    stock: 50,
    unit: "pcs",
    max: 200,
    min: 10,
    icon: "Utensils",
    color: "bg-slate-100 text-slate-600",
    imageUrl:
      "https://raw.githubusercontent.com/Dinni-hub/manajemen-stok/main/(50%20pieces)%20Disposable%20Fork%20%26%20Spoon%20High%20Quality%20Plastic%20PP%20Fork%20Spoon_%20Plastic%20Cutlery%20_%20Garpu%20Plastik%20_%20Sudu%20Plastik.jpg",
  },
  {
    id: 4,
    name: "Tusuk Sate",
    stock: 100,
    unit: "pcs",
    max: 500,
    min: 100,
    icon: "Flame",
    color: "bg-stone-100 text-stone-600",
    imageUrl:
      "https://raw.githubusercontent.com/Dinni-hub/manajemen-stok/main/Tusuk%20sate%20_%20tusuk%20pentol%2C%20Sempol%2C%20sate%20kambing%20_%20sapi_%20Merk%20_panda%20alami_%20isi%20%C2%B1200%20biji.jpg",
  },
];

const ALL_MENU_ITEMS = [
  {
    id: 1,
    name: "Indomie Goreng",
    type: "Mie • Polos",
    price: "Rp 6.000",
    priceNum: 6000,
    rating: "4.9",
    time: "5-10 min",
    delivery: "Gratis Ongkir",
    img: "https://raw.githubusercontent.com/Dinni-hub/indomi-goreng/main/Tambahkan_1_bungkus_202603191355.jpeg",
    categories: ["Mie"],
    description: "Original, gurih, dan bikin nagih",
    toppings: ["Telur Rp 2.000", "Sosis Rp 2.000"],
  },
  {
    id: 2,
    name: "Indomie Soto",
    type: "Mie • Kuah",
    price: "Rp 6.000",
    priceNum: 6000,
    rating: "4.9",
    time: "5-10 min",
    delivery: "Gratis Ongkir",
    img: "https://raw.githubusercontent.com/Dinni-hub/indomi-goreng/main/Indomi_soto_koya_202603191401.jpeg",
    categories: ["Mie"],
    description: "Kuah soto segar dengan koya gurih",
    toppings: ["Telur Rp 2.000", "Sosis Rp 2.000"],
  },
  {
    id: 3,
    name: "Indomie Rendang",
    type: "Mie • Goreng",
    price: "Rp 7.000",
    priceNum: 7000,
    rating: "4.9",
    time: "5-10 min",
    delivery: "Gratis Ongkir",
    img: "https://raw.githubusercontent.com/Dinni-hub/indomi-goreng/main/tolong_buatkan_sepiring_202603191352.png",
    categories: ["Mie"],
    description: "Cita rasa rendang yang autentik",
    toppings: ["Telur Rp 2.000", "Sosis Rp 2.000"],
  },
  {
    id: 4,
    name: "Telur Gulung",
    type: "Snack • Gurih",
    price: "Rp 1.000",
    priceNum: 1000,
    rating: "4.9",
    time: "5-10 min",
    delivery: "Gratis Ongkir",
    img: "https://raw.githubusercontent.com/Dinni-hub/telur-gulung-2/main/Telur%20Gulung%20Jajanan%20Lezat%20Gampang%20Dibuat%20-%20Resep%20_%20ResepKoki.jpg",
    categories: ["Snack", "Spesial Buat Kamu"],
    description: "Lembut, gurih, dan bikin nagih.",
    toppings: ["Saus Sambal Rp 0", "Saus Tomat Rp 0"],
  },
  {
    id: 5,
    name: "Telur Gulung Sosis",
    type: "Snack • Gurih",
    price: "Rp 2.000",
    priceNum: 2000,
    rating: "4.9",
    time: "5-10 min",
    delivery: "Gratis Ongkir",
    img: "https://raw.githubusercontent.com/Dinni-hub/indomi-goreng/main/Telur_gulung_isi_202603191412.jpeg",
    categories: ["Snack", "Spesial Buat Kamu"],
    description: "Telur gulung dengan isian sosis lezat.",
    toppings: ["Saus Sambal Rp 0", "Saus Tomat Rp 0"],
  },
  {
    id: 6,
    name: "Add on",
    type: "Tambahan",
    price: "Rp 0",
    priceNum: 0,
    rating: "5.0",
    time: "0 min",
    delivery: "Gratis Ongkir",
    img: "",
    categories: ["Tambahan"],
    description: "Manual Custom Add-on",
    toppings: [],
  },
];

const getToppingPrice = (topping: string) => {
  const tLower = topping.toLowerCase();
  const match = tLower.match(/\+?rp\s*([\d\.]+)/);
  if (match) {
    return parseInt(match[1].replace(/\./g, ""), 10);
  }
  if (tLower.includes("telur")) return 4000;
  if (tLower.includes("sayur")) return 1000;
  if (tLower.includes("sosis")) return 1000;
  if (tLower.includes("cabe")) return 0;
  return 0;
};

const calculateItemPrice = (
  itemName: string,
  basePrice: number,
  toppings: string[],
) => {
  let total = basePrice;
  toppings.forEach((t) => {
    total += getToppingPrice(t);
  });
  return total;
};

const getItemHPP = (itemName: string, toppings: string[] = []) => {
  const isGoreng = itemName.includes("Goreng");
  const isSoto = itemName.includes("Soto");
  const isRendang = itemName.includes("Rendang");
  const isTelurGulung = itemName.includes("Telur Gulung");

  let telurCount = 0;
  let sosisCount = 0;
  toppings.forEach((t) => {
    const tLower = t.toLowerCase().split("+rp")[0];
    if (tLower.includes("telur")) telurCount++;
    if (tLower.includes("sosis")) sosisCount++;
  });

  const operasional = 415;
  let bahan = 0;

  if (isGoreng) {
    bahan = 4093 + telurCount * 3000 + sosisCount * 782;
  } else if (isSoto) {
    bahan = 4356 + telurCount * 3000 + sosisCount * 782;
  } else if (isRendang) {
    bahan = 4203 + telurCount * 3000 + sosisCount * 782;
  } else if (isTelurGulung) {
    if (itemName.includes("Sosis")) {
      bahan = 562;
    } else {
      bahan = 451;
    }
  } else if (
    itemName === "Add on" ||
    !["Indomie", "Telur"].some((k) => itemName.includes(k))
  ) {
    bahan = telurCount * 3000 + sosisCount * 782;
    return bahan; // no operasional for custom add-ons
  } else {
    bahan = 4000 + telurCount * 3000 + sosisCount * 782;
  }

  return bahan + operasional;
};

const generateReceiptText = (order: Order) => {
  const time = order.timestamp.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  let text = `*PESANAN BARU - INDOMI NITE*\n`;
  text += `--------------------------------\n`;
  text += `Nama Pelanggan: ${order.customerName}\n`;
  if (order.customerPhone) {
    const formattedPhone = order.customerPhone.replace(/^0/, "62");
    text += `WA Pelanggan: https://wa.me/${formattedPhone}\n`;
  }
  if (order.customerAddress) {
    text += `Alamat Pengantaran: ${order.customerAddress}\n`;
  }
  text += `Jam Pemesanan: ${time}\n`;
  text += `--------------------------------\n`;
  text += `*Menu Pesanan:*\n`;
  if (order.items && Array.isArray(order.items)) {
    order.items.forEach((cart) => {
      if (!cart || !cart.item) return;
      text += `- ${cart.item.name} x${cart.quantity}\n`;
      if (cart.toppings && cart.toppings.length > 0) {
        const tMap = cart.toppings.reduce((acc: any, t: string) => {
          acc[t] = (acc[t] || 0) + 1;
          return acc;
        }, {});
        const isTelurGulung = cart.item.name
          .toLowerCase()
          .includes("telur gulung");
        const formattedToppings = Object.entries(tMap).map(
          ([name, count]: [string, any]) => {
            const isSaus =
              name.toLowerCase().includes("saus") ||
              name.toLowerCase().includes("sambal") ||
              name.toLowerCase().includes("tomat");
            const cleanName = name.split("+")[0].split("Rp")[0].trim();
            if (isSaus) {
              return cleanName;
            }
            return `${cleanName} x${count}`;
          },
        );
        text += `  Add on: ${formattedToppings.join(", ")}\n`;
      }
      if (cart.notes) {
        text += `  Catatan: ${cart.notes}\n`;
      }
    });
  }
  text += `--------------------------------\n`;
  text += `Total Pembayaran: Rp ${(order.total || 0).toLocaleString()}\n`;
  text += `Metode Pembayaran: ${order.paymentMethod || "TUNAI"}\n`;
  text += `--------------------------------\n`;
  return text;
};

const getLocalStorageItem = (key: string, defaultValue: string) => {
  try {
    return localStorage.getItem(key) || defaultValue;
  } catch (e) {
    return defaultValue;
  }
};

const OWNER_EMAILS = [
  "indominite@gmail.com",
  "innanifiddinillah@gmail.com",
  "indominitemode@gmail.com",
];

const isOwnerEmail = (email: string | null | undefined) => {
  if (!email) return false;
  const e = email.toLowerCase();
  return OWNER_EMAILS.includes(e);
};

const parseDateString = (dateStr: string) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatDateToString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const RadioGroup = ({
  label,
  options,
  current,
  setVal,
  number,
}: {
  label: string;
  options: string[];
  current: string;
  setVal: (v: string) => void;
  number: string;
}) => (
  <div className="space-y-3">
    <label className="text-sm font-bold text-[#3D2B1F] leading-snug block">
      {number}. {label}
    </label>
    <div className="flex flex-col gap-3">
      {options.map((opt) => (
        <div
          key={opt}
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => setVal(opt)}
        >
          <div
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${current === opt ? "border-[#3D2B1F]" : "border-stone-300"}`}
          >
            {current === opt && (
              <div className="w-2.5 h-2.5 bg-[#3D2B1F] rounded-full animate-fade-in" />
            )}
          </div>
          <span
            className={`text-sm transition-colors ${current === opt ? "font-bold text-[#3D2B1F]" : "font-medium text-[#3D2B1F]/70 group-hover:text-[#3D2B1F]"}`}
          >
            {opt}
          </span>
        </div>
      ))}
    </div>
  </div>
);

function KuesionerForm({ onSubmit }: { onSubmit: (data: any) => void }) {
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [q3, setQ3] = useState("");
  const [q4, setQ4] = useState("");
  const [q5, setQ5] = useState("");
  const [q6, setQ6] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ q1, q2, q3, q4, q5, q6 });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <p className="text-sm font-bold text-[#3D2B1F]/70 mb-4">
        Bantu Indomi Nite Jadi Lebih Baik!
      </p>

      <RadioGroup
        number="1"
        label="Seberapa mudah Anda menemukan menu yang diinginkan di dalam aplikasi?"
        options={["Sangat Sulit", "Sulit", "Cukup Mudah", "Sangat Mudah"]}
        current={q1}
        setVal={setQ1}
      />

      <RadioGroup
        number="2"
        label="Bagaimana penilaian Anda terhadap tampilan (layout) dan desain aplikasi?"
        options={[
          "Sangat Tidak Menarik",
          "Kurang Menarik",
          "Cukup Menarik",
          "Sangat Menarik",
        ]}
        current={q2}
        setVal={setQ2}
      />

      <RadioGroup
        number="3"
        label="Seberapa mudah Anda dalam menambah, mengurangi, atau memeriksa item makanan di dalam keranjang belanja?"
        options={["Sangat Sulit", "Sulit", "Cukup Mudah", "Sangat Mudah"]}
        current={q3}
        setVal={setQ3}
      />

      <RadioGroup
        number="4"
        label="Seberapa sering Anda mengalami kendala teknis (seperti error atau lag) saat menggunakan aplikasi?"
        options={["Selalu", "Sering", "Jarang", "Tidak Pernah"]}
        current={q4}
        setVal={setQ4}
      />

      <RadioGroup
        number="5"
        label="Bagaimana penilaian Anda terhadap alur pemesanan (dari pilih menu hingga selesai) di aplikasi ini?"
        options={[
          "Sangat Berbelit-belit",
          "Cukup Membingungkan",
          "Cukup Ringkas/Jelas",
          "Sangat Praktis dan Cepat",
        ]}
        current={q5}
        setVal={setQ5}
      />

      <div className="space-y-3">
        <label className="text-sm font-bold text-[#3D2B1F] leading-snug block">
          6. Apa saran atau masukan tambahan Anda agar aplikasi INDOMI NITE
          menjadi lebih baik ke depannya?
        </label>
        <textarea
          className="w-full bg-[#F5F2EA] border-none text-[#3D2B1F] placeholder-[#3D2B1F]/40 p-4 rounded-2xl resize-none h-32 focus:outline-none focus:ring-2 focus:ring-[#3D2B1F]/20 text-sm font-medium shadow-inner"
          placeholder="Ketik saran Anda di sini..."
          value={q6}
          onChange={(e) => setQ6(e.target.value)}
        ></textarea>
      </div>

      <button
        type="submit"
        className="w-full py-4 bg-[#3D2B1F] text-white rounded-2xl font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-stone-800 transition-colors"
        disabled={!q1 || !q2 || !q3 || !q4 || !q5}
      >
        Kirim Kuesioner
      </button>
    </form>
  );
}

export default function App() {
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  const [view, setView] = useState<View>(() => {
    try {
      const saved = localStorage.getItem("app_view");
      // If user is owner, they can go to owner view, otherwise default to home
      const userRole = localStorage.getItem("app_userRole");
      if (saved === "owner" && userRole !== "owner") return "home";
      if (
        saved &&
        ["welcome", "home", "detail", "checkout", "orders", "owner"].includes(
          saved,
        )
      ) {
        return saved as View;
      }
    } catch (e) {
      console.error("Error parsing view from localStorage", e);
    }
    return "welcome";
  });
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setView(event.state.view);
      } else {
        // If no state, they might be trying to exit the app from the first page
        if (view === "home" || view === "welcome") {
          setShowExitConfirmation(true);
          window.history.pushState({ view }, "");
        } else {
          setView("home");
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [view]);

  useEffect(() => {
    if (window.history.state?.view !== view) {
      window.history.pushState({ view }, "");
    }
  }, [view]);
  const [address, setAddress] = useState(() =>
    getLocalStorageItem("app_address", ""),
  );
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(() => {
    try {
      const saved = localStorage.getItem("app_selectedItem");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Error parsing selectedItem from localStorage", e);
    }
    return null;
  });
  const [ratingOrder, setRatingOrder] = useState<Order | null>(null);
  const [showAppFeedbackModal, setShowAppFeedbackModal] = useState(false);
  const [currentOrderFirebaseKey, setCurrentOrderFirebaseKey] = useState<
    string | null
  >(null);
  const [lastPlacedSessionId, setLastPlacedSessionId] = useState<string | null>(
    null,
  );
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [notification, setNotification] = useState<string | null>(null);
  const isPlacingOrderRef = useRef(false);
  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleAddAppFeedback = async (
    appRating: number,
    appFeedback: string,
  ) => {
    const newFeedback: AppFeedback = {
      id: Date.now().toString(),
      rating: appRating,
      comment: appFeedback,
      timestamp: new Date(),
      userName: currentUser?.displayName || customerName || "Guest",
      userEmail: currentUser?.email || customerEmail || "guest@example.com",
    };

    if (isFirebaseConfigured) {
      // Optimistic update for local state if owner
      if (userRole === "owner") {
        setFeedbacks([newFeedback, ...feedbacks]);
      }
      try {
        await addDoc(collection(db, "app_feedback"), newFeedback);
        showNotification("Terima kasih atas penilaian aplikasi Anda!");

        // Update orders with app feedback
        if (lastPlacedSessionId) {
          const sessionOrders = orders.filter(
            (o) => o.sessionId === lastPlacedSessionId,
          );
          if (sessionOrders.length > 0) {
            const batch = writeBatch(db);
            sessionOrders.forEach((order) => {
              if (order.firebaseKey) {
                batch.update(doc(db, "orders", order.firebaseKey), {
                  appRating: appRating,
                  appFeedback: appFeedback,
                });
              }
            });
            await batch.commit();
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "app_feedback");
      }
    } else {
      const updatedFeedbacks = [newFeedback, ...feedbacks];
      setFeedbacks(updatedFeedbacks);
      localStorage.setItem("app_feedbacks", JSON.stringify(updatedFeedbacks));
      showNotification("Terima kasih atas penilaian aplikasi Anda!");
    }

    // Update local orders state
    if (lastPlacedSessionId) {
      const updatedOrders = orders.map((o) => {
        if (o.sessionId === lastPlacedSessionId) {
          return { ...o, appRating, appFeedback };
        }
        return o;
      });
      setOrders(updatedOrders);
      localStorage.setItem("app_orders", JSON.stringify(updatedOrders));
    }
  };
  const [homeActiveTab, setHomeActiveTab] = useState(() =>
    getLocalStorageItem("app_homeTab", "home"),
  );
  const [homeActiveCategory, setHomeActiveCategory] = useState(() => {
    return localStorage.getItem("app_homeCategory") || "Mie";
  });

  useEffect(() => {
    localStorage.setItem("app_homeCategory", homeActiveCategory);
  }, [homeActiveCategory]);

  const [homeSearchQuery, setHomeSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("app_cart");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      }
    } catch (e) {
      console.error("Error parsing cart from localStorage", e);
    }
    return [];
  });

  const [demoOrders, setDemoOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem("app_demo_orders");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((o: any) => ({
            ...o,
            timestamp: o.timestamp ? new Date(o.timestamp) : new Date(),
          }));
        }
      }
    } catch (e) {
      console.error("Error parsing demo orders", e);
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem("app_demo_orders", JSON.stringify(demoOrders));
  }, [demoOrders]);

  const [showDemoOrdersOwner, setShowDemoOrdersOwner] = useState(false);

  const [userRole, setUserRole] = useState<"guest" | "customer" | "owner">(
    () => {
      try {
        const saved = localStorage.getItem("app_userRole");
        return (saved as any) || "guest";
      } catch (e) {
        return "guest";
      }
    },
  );
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isResettingData, setIsResettingData] = useState(false);
  const [isPerformingReset, setIsPerformingReset] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  useEffect(() => {
    async function testConnection() {
      if (isFirebaseConfigured) {
        try {
          await getDocFromServer(doc(db, "test", "connection"));
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("the client is offline")
          ) {
            console.error("Please check your Firebase configuration. ");
          }
        }
      }
    }
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error("Failed to sign in anonymously:", err);
          setUserRole("guest");
          setView((prev) => (prev === "owner" ? "home" : prev));
          setIsAuthReady(true);
        }
        return;
      }

      setCurrentUser(user);
      if (isOwnerEmail(user.email)) {
        setUserRole("owner");
        // Ensure owner session exists in Firestore
        if (isFirebaseConfigured && user) {
          try {
            await setDoc(doc(db, "owner_sessions", user.uid), {
              secret: "IndominiteSecret2026",
              email: user.email,
              timestamp: serverTimestamp(),
            });
          } catch (e) {
            console.error("Failed to restore owner session", e);
          }
        }
      } else {
        // Check if this anonymous user is an owner via owner_sessions
        if (isFirebaseConfigured) {
          try {
            const sessionDoc = await getDocFromServer(
              doc(db, "owner_sessions", user.uid),
            );
            if (sessionDoc.exists()) {
              setUserRole("owner");
              setIsAuthReady(true);
              return;
            }
          } catch (e) {
            // Ignore error
          }
        }

        // If they have typed the owner email locally, keep them as owner
        const storedProfile = localStorage.getItem("app_userProfile");
        let isLocalOwner = false;
        if (storedProfile) {
          try {
            const parsed = JSON.parse(storedProfile);
            if (isOwnerEmail(parsed.email)) {
              isLocalOwner = true;
            }
          } catch (e) {}
        }

        if (isLocalOwner) {
          setUserRole("owner");
          // Auto-create session for anonymous owner with secret
          if (user.isAnonymous && isFirebaseConfigured) {
            setDoc(doc(db, "owner_sessions", user.uid), {
              secret: "IndominiteSecret2026",
              email: OWNER_EMAILS[0],
              timestamp: serverTimestamp(),
            }).catch((e) => console.error("Auto-session creation failed", e));
          }
        } else {
          setUserRole("customer");
        }
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleOwnerLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email?.toLowerCase();
      updateRoleAndDemo(result.user.email, result.user);

      if (isOwnerEmail(email)) {
        setView("owner");
        showNotification("Selamat datang, Owner!");

        // Create owner session in Firestore to ensure rules recognize this user as owner
        // Note: isFirebaseConfigured is memoized based on isDemoMode. In the exact tick updateRoleAndDemo runs,
        // it might still use old value in closure here. But updateRoleAndDemo already handles owner_sessions for Firebase
        // if user is demo mode, the state will be updated soon. Actually updateRoleAndDemo already did the Firestore sync!
      } else {
        showNotification("Akses ditolak. Email ini bukan owner.");
        await signOut(auth);
      }
    } catch (error) {
      console.error("Login error:", error);
      showNotification("Gagal login.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUserRole("guest");
      setView("welcome");
      showNotification("Anda telah keluar.");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const updateRoleAndDemo = (
    email: string | null | undefined,
    userObj?: any,
  ) => {
    if (!email) return;
    const lower = email.toLowerCase();

    if (lower === "indominitemode@gmail.com" || lower === "indominite@gmail.com" || lower === "innanifiddinillah@gmail.com") {
      setIsDemoMode(false);
      setUserRole("owner");
    } else if (isOwnerEmail(email)) {
      setUserRole("owner");
    } else {
      setUserRole("customer");
    }

    if (isOwnerEmail(email) && userObj?.isAnonymous) {
      if (isFirebaseConfigured) {
        setDoc(doc(db, "owner_sessions", userObj.uid), {
          secret: "IndominiteSecret2026",
          email: OWNER_EMAILS[0],
          timestamp: serverTimestamp(),
        }).catch((e) => console.error("Auto-session on update failed", e));
      }
    }
  };

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      updateRoleAndDemo(result.user.email, result.user);
      showNotification("Login berhasil!");
    } catch (error) {
      console.error("Login error:", error);
      showNotification("Gagal login.");
    }
  };
  const [customerName, setCustomerName] = useState(() =>
    getLocalStorageItem("app_customerName", ""),
  );
  const [customerPhone, setCustomerPhone] = useState(() =>
    getLocalStorageItem("app_customerPhone", ""),
  );
  const [customerEmail, setCustomerEmail] = useState(() =>
    getLocalStorageItem("app_customerEmail", ""),
  );
  const [customerAddress, setCustomerAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("TUNAI");

  const [newOrderAlert, setNewOrderAlert] = useState<any | null>(null);
  const notifiedOrderIds = useRef<Set<string>>(new Set());

  // Initialize notifiedOrderIds from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("app_notified_orders");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          parsed.forEach((id) => notifiedOrderIds.current.add(id));
        }
      }
    } catch (e) {
      console.error("Error loading notified orders", e);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "app_notified_orders",
      JSON.stringify(Array.from(notifiedOrderIds.current)),
    );
  }, [newOrderAlert]); // Update whenever a new alert is shown or cleared
  const [feedbacks, setFeedbacks] = useState<AppFeedback[]>(() => {
    try {
      const saved = localStorage.getItem("app_feedbacks");
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((f: any) => ({
          ...f,
          timestamp: new Date(f.timestamp),
        }));
      }
    } catch (e) {
      console.error("Error parsing feedbacks from localStorage", e);
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem("app_feedbacks", JSON.stringify(feedbacks));
  }, [feedbacks]);
  const prevOrdersRef = useRef<Order[]>([]);

  const [ownerSubView, setOwnerSubView] = useState<string | null>(() => {
    return localStorage.getItem("app_ownerSubView") || null;
  });

  useEffect(() => {
    if (ownerSubView) {
      localStorage.setItem("app_ownerSubView", ownerSubView);
    } else {
      localStorage.removeItem("app_ownerSubView");
    }
  }, [ownerSubView]);

  const [inventory, setInventory] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("app_inventory");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const validParsed = parsed.filter(Boolean);
          // Merge missing default items
          const existingIds = new Set(validParsed.map((item) => item.id));
          const missingItems = DEFAULT_INVENTORY.filter(
            (item) => !existingIds.has(item.id),
          );
          const merged = [...validParsed, ...missingItems];
          merged.sort((a, b) => {
            const indexA = DEFAULT_INVENTORY.findIndex((i) => i.id === a.id);
            const indexB = DEFAULT_INVENTORY.findIndex((i) => i.id === b.id);
            return (
              (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
            );
          });
          return merged;
        }
      }
    } catch (e) {
      console.error("Error parsing inventory from localStorage", e);
    }
    return DEFAULT_INVENTORY;
  });
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem("app_orders");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.reduce((acc: any[], o: any) => {
            if (o) {
              let timestamp = o.timestamp ? new Date(o.timestamp) : new Date();
              if (
                !isNaN(timestamp.getTime()) &&
                timestamp.getFullYear() === 2001
              ) {
                timestamp.setFullYear(new Date().getFullYear());
              }
              acc.push({
                ...o,
                timestamp,
              });
            }
            return acc;
          }, []);
        }
      }
    } catch (e) {
      console.error("Error parsing orders from localStorage", e);
    }
    return [];
  });

  const [dismissedNotifs, setDismissedNotifs] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("app_dismissed_notifs");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Error parsing dismissed notifs", e);
    }
    return [];
  });

  const handleDismissNotif = (notifId: string) => {
    setDismissedNotifs((prev) => {
      const updated = [...prev, notifId];
      localStorage.setItem("app_dismissed_notifs", JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => {
    if (userRole !== "owner" && orders.length > 0) {
      const prevOrders = prevOrdersRef.current;
      if (prevOrders.length > 0) {
        // Find orders that just became 'selesai'
        const newlyCompleted = orders.find(
          (o) =>
            o.status === "selesai" &&
            !o.rating &&
            prevOrders.find((po) => po.id === o.id && po.status !== "selesai"),
        );
        if (newlyCompleted) {
          setRatingOrder(newlyCompleted);
        }
      }
    }
    prevOrdersRef.current = orders;
  }, [orders, userRole]);

  const isFirebaseConfigured = useMemo(() => {
    return !isDemoMode;
  }, [isDemoMode]);

  useEffect(() => {
    console.log("Firebase configured:", isFirebaseConfigured);
  }, [isFirebaseConfigured]);

  // Synchronize Counter Daily (Owner Only)
  useEffect(() => {
    if (userRole === "owner" && isFirebaseConfigured && orders.length > 0) {
      const initCounter = async () => {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayOrders = orders.filter((o) => {
          if (!o.timestamp) return false;
          const orderTime =
            o.timestamp instanceof Date
              ? o.timestamp
              : typeof (o.timestamp as any).toDate === "function"
                ? (o.timestamp as any).toDate()
                : new Date(o.timestamp);
          return (
            !isNaN(orderTime.getTime()) &&
            orderTime >= todayStart &&
            !o.isDeleted
          );
        });

        if (todayOrders.length > 0) {
          const maxOrderNumber = Math.max(
            ...todayOrders.map((o) => {
              if (!o.orderNumber) return 0;
              const clean = o.orderNumber.toString().replace(/[^0-9]/g, "");
              return parseInt(clean, 10) || 0;
            }),
          );

          if (maxOrderNumber > 0) {
            try {
              const counterRef = doc(db, "counters", dateStr);
              const counterSnap = await getDocFromServer(counterRef);
              if (
                !counterSnap.exists() ||
                counterSnap.data().count < maxOrderNumber
              ) {
                await setDoc(
                  counterRef,
                  { count: maxOrderNumber },
                  { merge: true },
                );
                console.log(
                  `Synced counter for ${dateStr} to ${maxOrderNumber}`,
                );
              }
            } catch (err) {
              console.error("Failed to sync counter:", err);
            }
          }
        }
      };

      const timeoutId = setTimeout(initCounter, 3000);
      return () => clearTimeout(timeoutId);
    }
  }, [orders.length, userRole, isFirebaseConfigured]);

  useEffect(() => {
    if (isFirebaseConfigured) {
      let unsubscribeOrders: any = null;

      if (userRole === "owner" && currentUser) {
        const ordersQuery = query(
          collection(db, "orders"),
          orderBy("timestamp", "desc"),
        );
        unsubscribeOrders = onSnapshot(
          ordersQuery,
          (snapshot) => {
            const ordersList = snapshot.docs.map((doc) => {
              const data = doc.data();
              let timestamp = data.timestamp
                ? data.timestamp.toDate
                  ? data.timestamp.toDate()
                  : new Date(data.timestamp)
                : new Date();
              if (
                !isNaN(timestamp.getTime()) &&
                timestamp.getFullYear() === 2001
              ) {
                timestamp.setFullYear(new Date().getFullYear());
              }
              return {
                ...data,
                firebaseKey: doc.id,
                id: String(data.id || doc.id),
                timestamp,
              };
            }) as Order[];

            setOrders((prev) => {
              const ordersMap = new Map<string, Order>();

              // 1. Process Firestore orders (they take priority)
              ordersList.forEach((order) => {
                const key = `${order.id}-${order.sessionId}`;
                // If we have multiple Firestore docs for same order, keep the first one (latest by query)
                if (!ordersMap.has(key)) {
                  ordersMap.set(key, order);
                }
              });

              // 2. Process local orders that haven't been synced yet
              prev.forEach((localOrder) => {
                const key = `${localOrder.id}-${localOrder.sessionId}`;
                // Only add back if not in current snapshot and it's NOT a synced Firestore order
                if (!ordersMap.has(key) && !localOrder.firebaseKey) {
                  ordersMap.set(key, localOrder);
                }
              });

              const final = Array.from(ordersMap.values()).sort(
                (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
              );
              localStorage.setItem("app_orders", JSON.stringify(final));
              return final;
            });

            // Check for new orders for owner alert using docChanges
            // This ensures we only trigger when isReadyForNotify is true
            snapshot.docChanges().forEach((change) => {
              if (change.type === "added" || change.type === "modified") {
                const orderData = change.doc.data() as any;
                const orderId = String(orderData.id || change.doc.id);

                // Only trigger if isReadyForNotify is true
                // and if we haven't notified for this ID yet (Anti-Duplikat)
                if (
                  orderData.isReadyForNotify === true &&
                  !notifiedOrderIds.current.has(orderId)
                ) {
                  notifiedOrderIds.current.add(orderId);
                  localStorage.setItem(
                    "app_notified_orders",
                    JSON.stringify(Array.from(notifiedOrderIds.current)),
                  );

                  // We check if the order is recent (within last 2 hours to be safe since feedback might take time)
                  const rawTimestamp = orderData.timestamp;
                  const orderTime = rawTimestamp
                    ? rawTimestamp.toDate
                      ? rawTimestamp.toDate()
                      : new Date(rawTimestamp)
                    : new Date();
                  const isRecent =
                    new Date().getTime() - orderTime.getTime() <
                    2 * 60 * 60 * 1000;

                  if (isRecent) {
                    console.log("NOTIFIKASI DIPICU!", {
                      customerName: orderData.customerName,
                      orderId,
                    });
                    setNewOrderAlert({
                      customerName: orderData.customerName,
                      total: orderData.total,
                    });

                    try {
                      if (!(window as any)._orderAudio) {
                        const audio = new Audio(
                          "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
                        );
                        audio.loop = true;
                        audio
                          .play()
                          .catch((e) => console.log("Audio play blocked", e));
                        (window as any)._orderAudio = audio;
                      }
                    } catch (e) {
                      console.log("Audio play failed", e);
                    }
                  }
                }
              }
            });
          },
          (error) => handleFirestoreError(error, OperationType.GET, "orders"),
        );
      } else if (currentUser) {
        let ordersQuery;
        if (currentUser.email) {
          ordersQuery = query(
            collection(db, "orders"),
            where("customerEmail", "==", currentUser.email),
            orderBy("timestamp", "desc"),
          );
        } else {
          ordersQuery = query(
            collection(db, "orders"),
            where("uid", "==", currentUser.uid),
            orderBy("timestamp", "desc"),
          );
        }

        unsubscribeOrders = onSnapshot(
          ordersQuery,
          (snapshot) => {
            const ordersList = snapshot.docs.map((doc) => {
              const data = doc.data();
              let timestamp = data.timestamp
                ? data.timestamp.toDate
                  ? data.timestamp.toDate()
                  : new Date(data.timestamp)
                : new Date();
              if (
                !isNaN(timestamp.getTime()) &&
                timestamp.getFullYear() === 2001
              ) {
                timestamp.setFullYear(new Date().getFullYear());
              }
              return {
                ...data,
                firebaseKey: doc.id,
                id: String(data.id || doc.id),
                timestamp,
              };
            }) as Order[];

            setOrders((prev) => {
              const ordersMap = new Map<string, Order>();

              // 1. Process Firestore orders (they take priority)
              ordersList.forEach((order) => {
                const key = `${order.id}-${order.sessionId}`;
                // If we have multiple Firestore docs for same order, keep the first one (latest by query)
                if (!ordersMap.has(key)) {
                  ordersMap.set(key, order);
                }
              });

              // 2. Process local orders that haven't been synced yet
              prev.forEach((localOrder) => {
                const key = `${localOrder.id}-${localOrder.sessionId}`;
                // Only add back if not in current snapshot and it's NOT a synced Firestore order
                if (!ordersMap.has(key) && !localOrder.firebaseKey) {
                  ordersMap.set(key, localOrder);
                }
              });

              const final = Array.from(ordersMap.values()).sort(
                (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
              );
              localStorage.setItem("app_orders", JSON.stringify(final));
              return final;
            });
          },
          (error) => handleFirestoreError(error, OperationType.GET, "orders"),
        );
      } else {
        // For guests, we don't clear orders because they might have just placed some locally
        // or we might want to keep the local storage orders visible
        const saved = localStorage.getItem("app_orders");
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setOrders(
              parsed.map((o: any) => {
                let timestamp = new Date(o.timestamp);
                if (
                  !isNaN(timestamp.getTime()) &&
                  timestamp.getFullYear() === 2001
                ) {
                  timestamp.setFullYear(new Date().getFullYear());
                }
                return { ...o, timestamp };
              }),
            );
          } catch (e) {
            setOrders([]);
          }
        }
      }

      const unsubscribeInventory = onSnapshot(
        collection(db, "inventory"),
        (snapshot) => {
          if (!snapshot.empty) {
            const inventoryData = snapshot.docs.map((doc) => ({
              ...doc.data(),
              firebaseKey: doc.id,
            })) as any[];
            inventoryData.sort((a, b) => {
              const indexA = DEFAULT_INVENTORY.findIndex((i) => i.id === a.id);
              const indexB = DEFAULT_INVENTORY.findIndex((i) => i.id === b.id);
              return (
                (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
              );
            });
            setInventory(inventoryData);

            // Check for missing default inventory items and add them if owner
            if (userRole === "owner" && currentUser) {
              const existingIds = new Set(inventoryData.map((item) => item.id));
              DEFAULT_INVENTORY.forEach(async (item) => {
                if (!existingIds.has(item.id)) {
                  try {
                    await setDoc(doc(db, "inventory", String(item.id)), item);
                  } catch (err) {
                    console.error("Failed to add missing inventory item", err);
                  }
                }
              });
            }
          } else {
            // Initialize inventory if empty and user is owner
            if (userRole === "owner" && currentUser) {
              DEFAULT_INVENTORY.forEach(async (item) => {
                try {
                  await setDoc(doc(db, "inventory", String(item.id)), item);
                } catch (err) {
                  console.error("Failed to initialize inventory item", err);
                }
              });
            } else {
              setInventory(DEFAULT_INVENTORY); // Fallback to local default for guests if DB is empty
            }
          }
        },
        (error) => handleFirestoreError(error, OperationType.GET, "inventory"),
      );

      let unsubscribeFeedbacks: any;
      if (userRole === "owner" && currentUser) {
        unsubscribeFeedbacks = onSnapshot(
          collection(db, "app_feedback"),
          (snapshot) => {
            const feedbacksList = snapshot.docs.map((doc) => {
              const data = doc.data();
              return {
                ...data,
                id: doc.id,
                timestamp: data.timestamp
                  ? data.timestamp.toDate
                    ? data.timestamp.toDate()
                    : new Date(data.timestamp)
                  : new Date(),
              };
            }) as AppFeedback[];
            // Sort by timestamp descending
            feedbacksList.sort(
              (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
            );
            setFeedbacks(feedbacksList);
          },
          (error) =>
            handleFirestoreError(error, OperationType.GET, "app_feedback"),
        );
      }

      return () => {
        if (unsubscribeOrders) unsubscribeOrders();
        if (unsubscribeInventory) unsubscribeInventory();
        if (unsubscribeFeedbacks) unsubscribeFeedbacks();
      };
    }
  }, [isFirebaseConfigured, userRole, currentUser]);

  useEffect(() => {
    localStorage.setItem("app_view", view);
    // If we are in detail view but have no item, go back home
    if (view === "detail" && !selectedItem) {
      setView("home");
    }
  }, [view, selectedItem]);

  useEffect(() => {
    if (selectedItem) {
      localStorage.setItem("app_selectedItem", JSON.stringify(selectedItem));
    } else {
      localStorage.removeItem("app_selectedItem");
    }
  }, [selectedItem]);

  useEffect(() => {
    localStorage.setItem("app_homeTab", homeActiveTab);
  }, [homeActiveTab]);

  useEffect(() => {
    localStorage.setItem("app_cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem("app_userRole", userRole);
  }, [userRole]);

  useEffect(() => {
    localStorage.setItem("app_customerName", customerName);
  }, [customerName]);

  useEffect(() => {
    localStorage.setItem("app_customerPhone", customerPhone);
  }, [customerPhone]);

  useEffect(() => {
    localStorage.setItem("app_customerEmail", customerEmail);
  }, [customerEmail]);

  useEffect(() => {
    localStorage.setItem("app_address", address);
  }, [address]);

  const allOrdersForOwner = useMemo(() => {
    const combined = [...demoOrders, ...orders];
    if (showDemoOrdersOwner) {
      return combined.filter((o) => o.isDemo || String(o.id).includes("DEMO"));
    }
    return combined.filter((o) => !o.isDemo && !String(o.id).includes("DEMO"));
  }, [demoOrders, orders, showDemoOrdersOwner]);

  // Calculate stats from orders
  const { totalRevenue, totalOrders, revenueToday } = useMemo(() => {
    const validOrders = allOrdersForOwner.filter(
      (o) => o.status !== "dibatalkan" && !o.isDeleted,
    );
    const total = validOrders.reduce((sum, order) => sum + order.total, 0);

    const today = new Date().toDateString();
    const todayRevenue = validOrders
      .filter((o) => {
        const time =
          o.timestamp instanceof Date ? o.timestamp : new Date(o.timestamp);
        return time.toDateString() === today;
      })
      .reduce((sum, order) => sum + order.total, 0);

    const realOrdersCount = validOrders.filter(
      (o) => !String(o.id).startsWith("ADJ-"),
    ).length;

    return {
      totalRevenue: total,
      totalOrders: realOrdersCount,
      revenueToday: todayRevenue,
    };
  }, [allOrdersForOwner]);

  const handleSelectItem = (item: any) => {
    setSelectedItem(item);
    setView("detail");
  };

  const handlePlaceOrder = async (
    name: string,
    phone: string,
    email: string,
    orderAddress: string,
    isTestChecked: boolean,
  ) => {
    if (isPlacingOrderRef.current) return;
    if (!cart || cart.length === 0) return;

    isPlacingOrderRef.current = true;

    const finalName = name || "Pelanggan";
    const isThisOrderDemo = isTestChecked;

    setCustomerName(finalName);
    setCustomerPhone(phone);
    setCustomerEmail(email);
    setAddress(orderAddress);

    // 1. Calculate Order Number (Reset Daily)
    const orderNumber = isThisOrderDemo
      ? 9999
      : await getNextOrderNumber(isFirebaseConfigured, orders);
    const sessionId = Date.now().toString();
    setLastPlacedSessionId(sessionId);
    const baseOrderCount = orders.length;

    const newOrder: Order = {
      id: `${(baseOrderCount + 1).toString().padStart(4, "0")}-${sessionId.slice(-4)}${isThisOrderDemo ? "-DEMO" : ""}`,
      orderNumber: String(orderNumber),
      sessionId: sessionId,
      uid: auth.currentUser?.uid || null,
      customerName: finalName,
      customerPhone: phone,
      customerEmail: email,
      customerAddress: orderAddress,
      paymentMethod: paymentMethod,
      items: [...cart],
      total: cart.reduce((sum, item) => sum + item.totalPrice, 0),
      calculatedProfit: Math.round(
        cart.reduce((sum, item) => sum + item.totalPrice, 0) * 0.3173,
      ),
      timestamp: new Date(),
      status: "diterima",
      paymentStatus: "belum",
      isReadyForNotify: false,
      isDemo: isThisOrderDemo,
    };

    const newOrders = [newOrder];

    // 2. Deduct Inventory (Skip if Demo)
    const newInventory = inventory.map((item) => ({ ...item }));

    if (!isThisOrderDemo) {
      cart.forEach((cartItem) => {
        // Deduct Main Item
        if (cartItem.item.name === "Indomie Goreng Klasik") {
          const idx = newInventory.findIndex(
            (i) => i.name === "Indomie Goreng Klasik",
          );
          if (idx > -1)
            newInventory[idx].stock = Math.max(
              0,
              newInventory[idx].stock - cartItem.quantity,
            );
        } else if (cartItem.item.name === "Indomie Kuah Soto") {
          const idx = newInventory.findIndex(
            (i) => i.name === "Indomie Soto Kuah",
          );
          if (idx > -1)
            newInventory[idx].stock = Math.max(
              0,
              newInventory[idx].stock - cartItem.quantity,
            );
        } else if (cartItem.item.name === "Indomie Rendang") {
          const idx = newInventory.findIndex(
            (i) => i.name === "Indomie Rendang",
          );
          if (idx > -1)
            newInventory[idx].stock = Math.max(
              0,
              newInventory[idx].stock - cartItem.quantity,
            );
        } else if (cartItem.item.name === "Telur Gulung") {
          const telurIdx = newInventory.findIndex((i) => i.name === "Telur");
          if (telurIdx > -1)
            newInventory[telurIdx].stock = Math.max(
              0,
              newInventory[telurIdx].stock - cartItem.quantity,
            );
        } else if (cartItem.item.name === "Telur Gulung Sosis") {
          const telurIdx = newInventory.findIndex((i) => i.name === "Telur");
          if (telurIdx > -1)
            newInventory[telurIdx].stock = Math.max(
              0,
              newInventory[telurIdx].stock - cartItem.quantity,
            );
          const sosisIdx = newInventory.findIndex((i) => i.name === "Sosis");
          if (sosisIdx > -1)
            newInventory[sosisIdx].stock = Math.max(
              0,
              newInventory[sosisIdx].stock - cartItem.quantity,
            );
        }

        // Deduct Toppings
        if (cartItem.toppings && Array.isArray(cartItem.toppings)) {
          cartItem.toppings.forEach((topping) => {
            if (topping.includes("Telur")) {
              const idx = newInventory.findIndex((i) => i.name === "Telur");
              if (idx > -1)
                newInventory[idx].stock = Math.max(
                  0,
                  newInventory[idx].stock - cartItem.quantity,
                );
            }
            if (topping.includes("Sosis")) {
              const idx = newInventory.findIndex((i) => i.name === "Sosis");
              if (idx > -1)
                newInventory[idx].stock = Math.max(
                  0,
                  newInventory[idx].stock - cartItem.quantity,
                );
            }
          });
        }

        // Deduct Packaging & Utensils
        if (cartItem.item.name === "Indomie Kuah Soto") {
          const bowlIdx = newInventory.findIndex((i) => i.name === "Bowl");
          if (bowlIdx > -1)
            newInventory[bowlIdx].stock = Math.max(
              0,
              newInventory[bowlIdx].stock - cartItem.quantity,
            );
          const sendokIdx = newInventory.findIndex((i) => i.name === "Sendok");
          if (sendokIdx > -1)
            newInventory[sendokIdx].stock = Math.max(
              0,
              newInventory[sendokIdx].stock - cartItem.quantity,
            );
          const garpuIdx = newInventory.findIndex((i) => i.name === "Garpu");
          if (garpuIdx > -1)
            newInventory[garpuIdx].stock = Math.max(
              0,
              newInventory[garpuIdx].stock - cartItem.quantity,
            );
          const plastikIdx = newInventory.findIndex(
            (i) => i.name === "Plastik",
          );
          if (plastikIdx > -1)
            newInventory[plastikIdx].stock = Math.max(
              0,
              newInventory[plastikIdx].stock - cartItem.quantity,
            );
        } else if (
          cartItem.item.name === "Indomie Goreng Klasik" ||
          cartItem.item.name === "Indomie Rendang"
        ) {
          const bowlIdx = newInventory.findIndex((i) => i.name === "Bowl");
          if (bowlIdx > -1)
            newInventory[bowlIdx].stock = Math.max(
              0,
              newInventory[bowlIdx].stock - cartItem.quantity,
            );
          const garpuIdx = newInventory.findIndex((i) => i.name === "Garpu");
          if (garpuIdx > -1)
            newInventory[garpuIdx].stock = Math.max(
              0,
              newInventory[garpuIdx].stock - cartItem.quantity,
            );
          const plastikIdx = newInventory.findIndex(
            (i) => i.name === "Plastik",
          );
          if (plastikIdx > -1)
            newInventory[plastikIdx].stock = Math.max(
              0,
              newInventory[plastikIdx].stock - cartItem.quantity,
            );
        } else if (
          cartItem.item.name === "Telur Gulung" ||
          cartItem.item.name === "Telur Gulung Sosis"
        ) {
          const tusukIdx = newInventory.findIndex(
            (i) => i.name === "Tusuk Sate",
          );
          if (tusukIdx > -1)
            newInventory[tusukIdx].stock = Math.max(
              0,
              newInventory[tusukIdx].stock - cartItem.quantity,
            );
          const plastikIdx = newInventory.findIndex(
            (i) => i.name === "Plastik",
          );
          if (plastikIdx > -1)
            newInventory[plastikIdx].stock = Math.max(
              0,
              newInventory[plastikIdx].stock - cartItem.quantity,
            );
        }
      });

      // 3. Update Local State Immediately (only if not using Firebase to avoid duplicates)
      if (!isFirebaseConfigured) {
        const updatedOrders = [...newOrders, ...orders];
        setOrders(updatedOrders);
        localStorage.setItem("app_orders", JSON.stringify(updatedOrders));
      }

      setInventory(newInventory);
      localStorage.setItem("app_inventory", JSON.stringify(newInventory));

      if (isFirebaseConfigured) {
        // 1. Add Orders to Firestore
        await Promise.all(
          newOrders.map(async (order) => {
            try {
              const docRef = await addDoc(collection(db, "orders"), {
                ...order,
                timestamp: serverTimestamp(),
              });

              setCurrentOrderFirebaseKey(docRef.id);

              // No need to update local state here as onSnapshot will handle it
              // and we want to avoid any potential duplication or race conditions
            } catch (err) {
              console.error("Failed to add order to Firestore:", err);
            }
          }),
        );

        // 2. Update Inventory in Firestore using increment for better sync
        const batch = writeBatch(db);
        const inventoryDeductions: { [key: string]: number } = {};

        cart.forEach((cartItem) => {
          // Main Item
          let mainItemId = "";
          if (cartItem.item.name === "Indomie Goreng") mainItemId = "1";
          else if (cartItem.item.name === "Indomie Soto") mainItemId = "10";
          else if (cartItem.item.name === "Indomie Rendang") mainItemId = "11";
          else if (cartItem.item.name === "Telur Gulung") {
            inventoryDeductions["2"] =
              (inventoryDeductions["2"] || 0) + cartItem.quantity; // Telur
          } else if (cartItem.item.name === "Telur Gulung Sosis") {
            inventoryDeductions["2"] =
              (inventoryDeductions["2"] || 0) + cartItem.quantity; // Telur
            inventoryDeductions["9"] =
              (inventoryDeductions["9"] || 0) + cartItem.quantity; // Sosis
          }

          if (mainItemId) {
            inventoryDeductions[mainItemId] =
              (inventoryDeductions[mainItemId] || 0) + cartItem.quantity;
          }

          // Toppings
          if (cartItem.toppings && Array.isArray(cartItem.toppings)) {
            cartItem.toppings.forEach((topping) => {
              if (topping.includes("Telur"))
                inventoryDeductions["2"] =
                  (inventoryDeductions["2"] || 0) + cartItem.quantity;
              if (topping.includes("Sosis"))
                inventoryDeductions["9"] =
                  (inventoryDeductions["9"] || 0) + cartItem.quantity;
            });
          }

          // Packaging
          if (cartItem.item.name === "Indomie Soto") {
            inventoryDeductions["13"] =
              (inventoryDeductions["13"] || 0) + cartItem.quantity; // Bowl
            inventoryDeductions["14"] =
              (inventoryDeductions["14"] || 0) + cartItem.quantity; // Sendok
            inventoryDeductions["6"] =
              (inventoryDeductions["6"] || 0) + cartItem.quantity; // Garpu
            inventoryDeductions["12"] =
              (inventoryDeductions["12"] || 0) + cartItem.quantity; // Plastik
          } else if (
            cartItem.item.name === "Indomie Goreng" ||
            cartItem.item.name === "Indomie Rendang"
          ) {
            inventoryDeductions["5"] =
              (inventoryDeductions["5"] || 0) + cartItem.quantity; // Packaging Box Kertas
            inventoryDeductions["6"] =
              (inventoryDeductions["6"] || 0) + cartItem.quantity; // Garpu
            inventoryDeductions["12"] =
              (inventoryDeductions["12"] || 0) + cartItem.quantity; // Plastik
          } else if (
            cartItem.item.name === "Telur Gulung" ||
            cartItem.item.name === "Telur Gulung Sosis"
          ) {
            inventoryDeductions["4"] =
              (inventoryDeductions["4"] || 0) + cartItem.quantity; // Tusuk Sate
            inventoryDeductions["12"] =
              (inventoryDeductions["12"] || 0) + cartItem.quantity; // Plastik
          }
        });

        Object.entries(inventoryDeductions).forEach(([id, amount]) => {
          console.log(
            `Updating inventory ID ${id} with deduction of ${amount}`,
          );
          batch.update(doc(db, "inventory", id), { stock: increment(-amount) });
        });

        batch
          .commit()
          .then(() => console.log("Inventory update committed successfully"))
          .catch((err) => {
            console.error("Failed to update inventory in Firestore:", err);
          });
      }

      setCart([]);
      setView("orders");
      showNotification("Pesanan berhasil dikirim!");
      setTimeout(() => {
        isPlacingOrderRef.current = false;
      }, 1000);

      // 4. Send to Owner's WhatsApp automatically (Skip if Demo)
      if (!isThisOrderDemo) {
        const receiptText = generateReceiptText(newOrders[0]); // Using the first item for the text if multiple, or we could join them
        // If multiple items were in cart, they are split into multiple orders in this implementation
        // Let's create a combined receipt if there are multiple orders from the same placement
        let combinedText = `*PESANAN BARU - INDOMI NITE*\n`;
        combinedText += `--------------------------------\n`;
        combinedText += `Nama Pelanggan: ${finalName}\n`;
        if (phone) combinedText += `No. WhatsApp: ${phone}\n`;
        combinedText += `Jam Pemesanan: ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}\n`;
        combinedText += `Alamat: ${orderAddress}\n`;
        combinedText += `--------------------------------\n`;
        combinedText += `*Menu Pesanan:*\n`;

        let totalAll = 0;
        cart.forEach((cartItem) => {
          combinedText += `- ${cartItem.item.name} x${cartItem.quantity}\n`;
          if (cartItem.toppings && cartItem.toppings.length > 0) {
            const tMap = cartItem.toppings.reduce((acc: any, t: string) => {
              acc[t] = (acc[t] || 0) + 1;
              return acc;
            }, {});
            const isTelurGulung = cartItem.item.name
              .toLowerCase()
              .includes("telur gulung");
            const formattedToppings = Object.entries(tMap).map(
              ([name, count]: [string, any]) => {
                const isSaus =
                  name.toLowerCase().includes("saus") ||
                  name.toLowerCase().includes("sambal") ||
                  name.toLowerCase().includes("tomat");
                const cleanName = name.split("+")[0].split("Rp")[0].trim();
                if (isSaus) {
                  return cleanName;
                }
                return `${cleanName} x${count}`;
              },
            );
            combinedText += `  Add on: ${formattedToppings.join(", ")}\n`;
          }
          if (cartItem.notes) {
            combinedText += `  Catatan: ${cartItem.notes}\n`;
          }
          totalAll += cartItem.totalPrice;
        });

        combinedText += `--------------------------------\n`;
        combinedText += `Total Pembayaran: Rp ${(totalAll || 0).toLocaleString()}\n`;
        combinedText += `Metode Pembayaran: ${paymentMethod}\n`;
        combinedText += `--------------------------------\n`;

        fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: `PESANAN BARU - INDOMI NITE - ${finalName}`,
            text: combinedText,
            html: combinedText.replace(/\n/g, "<br/>"),
          }),
        }).catch(console.error);
      }
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    // Check if it's a demo order
    const isDemoOrder = demoOrders.find(
      (o) => String(o.id) === String(orderId),
    );
    if (isDemoOrder) {
      setDemoOrders((prev) =>
        prev.map((o) =>
          String(o.id) === String(orderId)
            ? { ...o, status: "dibatalkan" as const }
            : o,
        ),
      );
      showNotification("Pesanan DUMMY telah dibatalkan.");
      return;
    }

    const order = orders.find(
      (o) => String(o.id) === String(orderId) || o.firebaseKey === orderId,
    );
    const actualId = order?.firebaseKey || orderId;
    if (isFirebaseConfigured) {
      try {
        const orderRef = doc(db, "orders", actualId);
        await updateDoc(orderRef, { status: "dibatalkan" });
        if (
          order &&
          order.status !== "dibatalkan" &&
          order.status !== "selesai"
        ) {
          const today = new Date();
          const dStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          const qCounterRef = doc(db, "counters", "completed_" + dStr);
          try {
            await setDoc(qCounterRef, { count: increment(1) }, { merge: true });
          } catch (e) {
            console.warn("Failed", e);
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "orders");
      }
    } else {
      const updatedOrders = orders.map((o) =>
        String(o.id) === String(orderId) || o.firebaseKey === orderId
          ? { ...o, status: "dibatalkan" as const }
          : o,
      );
      setOrders(updatedOrders);
      localStorage.setItem("app_orders", JSON.stringify(updatedOrders));
    }
    showNotification("Pesanan telah dibatalkan.");
  };

  const handleNotifyOrder = async (orderFirebaseKey: string) => {
    if (isFirebaseConfigured && orderFirebaseKey) {
      try {
        const orderRef = doc(db, "orders", orderFirebaseKey);
        await updateDoc(orderRef, { isReadyForNotify: true });
      } catch (err) {
        console.error("Failed to update isReadyForNotify:", err);
      }
    }
  };

  const handleRateOrder = async (
    orderId: string,
    rating: number,
    feedback: string,
  ) => {
    // Check if it's demo order
    const isDemoOrder = demoOrders.find(
      (o) => String(o.id) === String(orderId),
    );
    if (isDemoOrder) {
      setDemoOrders((prev) =>
        prev.map((o) =>
          String(o.id) === String(orderId) ? { ...o, rating, feedback } : o,
        ),
      );
      showNotification("Terima kasih atas penilaian Anda! (DUMMY)");
      return;
    }

    // Optimistic update
    const updatedOrders = orders.map((o) =>
      String(o.id) === String(orderId) || o.firebaseKey === orderId
        ? { ...o, rating, feedback }
        : o,
    );
    setOrders(updatedOrders);
    localStorage.setItem("app_orders", JSON.stringify(updatedOrders));

    const order = orders.find(
      (o) => String(o.id) === String(orderId) || o.firebaseKey === orderId,
    );
    if (isFirebaseConfigured) {
      try {
        if (order?.firebaseKey) {
          const orderRef = doc(db, "orders", order.firebaseKey);
          await updateDoc(orderRef, { rating, feedback });
        } else {
          console.error(
            "Order not found in Firestore for rating (missing firebaseKey):",
            orderId,
          );
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "orders");
      }
    }
    showNotification("Terima kasih atas penilaian Anda!");
  };

  const handleRemoveFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
    setNotification("Item dihapus dari keranjang");
    setTimeout(() => setNotification(null), 3000);
  };

  const handleEditCartItem = (index: number, updatedItem: CartItem) => {
    setCart((prev) => {
      const newCart = [...prev];
      newCart[index] = updatedItem;
      return newCart;
    });
    setNotification("Pesanan berhasil diubah");
    setTimeout(() => setNotification(null), 3000);
  };

  const getInventoryDeductionsForOrder = (order: any) => {
    const deductions: { [key: string]: number } = {};
    if (!order || !order.items || !Array.isArray(order.items)) return deductions;

    order.items.forEach((cartItem: any) => {
      // Main Item
      let mainItemId = "";
      const nameLower = (cartItem.item?.name || "").toLowerCase();
      
      if (nameLower.includes("indomie goreng")) {
        mainItemId = "1";
      } else if (nameLower.includes("indomie soto") || nameLower.includes("soto")) {
        mainItemId = "10";
      } else if (nameLower.includes("indomie rendang")) {
        mainItemId = "11";
      } else if (nameLower === "telur gulung") {
        deductions["2"] = (deductions["2"] || 0) + cartItem.quantity; // Telur
      } else if (nameLower === "telur gulung sosis") {
        deductions["2"] = (deductions["2"] || 0) + cartItem.quantity; // Telur
        deductions["9"] = (deductions["9"] || 0) + cartItem.quantity; // Sosis
      }

      if (mainItemId) {
        deductions[mainItemId] = (deductions[mainItemId] || 0) + cartItem.quantity;
      }

      // Toppings
      if (cartItem.toppings && Array.isArray(cartItem.toppings)) {
        cartItem.toppings.forEach((topping: any) => {
          const toppingStr = typeof topping === "string" ? topping : String(topping.name || topping);
          if (toppingStr.includes("Telur"))
            deductions["2"] = (deductions["2"] || 0) + cartItem.quantity;
          if (toppingStr.includes("Sosis"))
            deductions["9"] = (deductions["9"] || 0) + cartItem.quantity;
        });
      }

      // Packaging
      if (nameLower.includes("indomie soto") || nameLower.includes("soto")) {
        deductions["13"] = (deductions["13"] || 0) + cartItem.quantity; // Bowl
        deductions["14"] = (deductions["14"] || 0) + cartItem.quantity; // Sendok
        deductions["6"] = (deductions["6"] || 0) + cartItem.quantity; // Garpu
        deductions["12"] = (deductions["12"] || 0) + cartItem.quantity; // Plastik
      } else if (
        nameLower.includes("indomie goreng") ||
        nameLower.includes("indomie rendang")
      ) {
        deductions["5"] = (deductions["5"] || 0) + cartItem.quantity; // Packaging Box Kertas
        deductions["6"] = (deductions["6"] || 0) + cartItem.quantity; // Garpu
        deductions["12"] = (deductions["12"] || 0) + cartItem.quantity; // Plastik
      } else if (
        nameLower === "telur gulung" ||
        nameLower === "telur gulung sosis"
      ) {
        deductions["4"] = (deductions["4"] || 0) + cartItem.quantity; // Tusuk Sate
        deductions["12"] = (deductions["12"] || 0) + cartItem.quantity; // Plastik
      }
    });

    return deductions;
  };

  const updateInventoryStockForStatusChange = async (
    order: any,
    oldStatus: string,
    newStatus: string,
  ) => {
    if (oldStatus === newStatus) return;

    const deductions = getInventoryDeductionsForOrder(order);
    if (Object.keys(deductions).length === 0) return;

    let modifier = 0;
    if (oldStatus !== "dibatalkan" && newStatus === "dibatalkan") {
      modifier = 1; // Restore stock
    } else if (oldStatus === "dibatalkan" && newStatus !== "dibatalkan") {
      modifier = -1; // Deduct stock
    }

    if (modifier === 0) return;

    console.log(`Adjusting stock for order status change: ${oldStatus} -> ${newStatus}. Modifier: ${modifier}`);

    // Update local state first
    setInventory((prevInventory) => {
      const updated = prevInventory.map((item) => {
        const idStr = String(item.id);
        if (deductions[idStr]) {
          const change = deductions[idStr] * modifier;
          const newStock = Math.max(0, item.stock + change);
          return { ...item, stock: newStock };
        }
        return item;
      });
      localStorage.setItem("app_inventory", JSON.stringify(updated));
      return updated;
    });

    // Write to Firestore if configured
    if (isFirebaseConfigured && auth.currentUser) {
      try {
        const batch = writeBatch(db);
        Object.entries(deductions).forEach(([id, amount]) => {
          const itemRef = doc(db, "inventory", String(id));
          batch.update(itemRef, { stock: increment(amount * modifier) });
        });
        await batch.commit();
        console.log("Firestore stock updated successfully for status change");
      } catch (err) {
        console.error("Failed to update Firestore stock on status change:", err);
      }
    }
  };

  const handleUpdateOrderStatus = async (
    orderId: string,
    status: "diterima" | "dimasak" | "diantar" | "selesai" | "dibatalkan",
  ) => {
    console.log("--- Update Order Status Start ---");
    console.log("Updating order ID:", orderId, "to status:", status);

    // Check if it's a demo order
    const demoOrder = demoOrders.find((o) => String(o.id) === String(orderId));
    if (demoOrder) {
      setDemoOrders((prev) =>
        prev.map((o) =>
          String(o.id) === String(orderId) ? { ...o, status } : o,
        ),
      );
      showNotification(`Status pesanan DUMMY berhasil diperbarui (${status})`);
      return;
    }

    const order = orders.find(
      (o) => String(o.id) === String(orderId) || o.firebaseKey === orderId,
    );
    if (!order) {
      console.error("Order not found in state:", orderId);
      showNotification("Pesanan tidak ditemukan di data lokal.");
      return;
    }

    // Adjust stock inventory automatically based on transit of status (esp. cancelled "dibatalkan")
    await updateInventoryStockForStatusChange(order, order.status, status);

    let actualId = order.firebaseKey || orderId;

    if (isFirebaseConfigured && auth.currentUser) {
      try {
        let orderRef = doc(db, "orders", String(actualId));

        if (!order.firebaseKey && order.id) {
          const q = query(
            collection(db, "orders"),
            where("id", "==", order.id),
          );
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            orderRef = snapshot.docs[0].ref;
            actualId = snapshot.docs[0].id;
          } else {
            const updatedOrders = orders.map((o) =>
              String(o.id) === String(orderId) || o.firebaseKey === orderId
                ? { ...o, status }
                : o,
            );
            setOrders(updatedOrders);
            localStorage.setItem("app_orders", JSON.stringify(updatedOrders));
            showNotification("Status pesanan berhasil diperbarui (Lokal)");
            return;
          }
        }

        await updateDoc(orderRef, { status });

        if (
          (status === "selesai" || status === "dibatalkan") &&
          order.status !== "selesai" &&
          order.status !== "dibatalkan"
        ) {
          const today = new Date();
          const dStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          const qCounterRef = doc(db, "counters", "completed_" + dStr);
          try {
            await setDoc(qCounterRef, { count: increment(1) }, { merge: true });
          } catch (e) {
            console.warn("Failed to update queue counter", e);
          }
        }

        const updatedOrders = orders.map((o) =>
          String(o.id) === String(orderId) || o.firebaseKey === orderId
            ? { ...o, status }
            : o,
        );
        setOrders(updatedOrders);
        localStorage.setItem("app_orders", JSON.stringify(updatedOrders));
        showNotification("Status pesanan berhasil diperbarui");
      } catch (err: any) {
        console.error("Error updating order:", err);
        const errorCode = err.code || "unknown";

        if (errorCode === "permission-denied" || errorCode === "not-found") {
          const updatedOrders = orders.map((o) =>
            String(o.id) === String(orderId) || o.firebaseKey === orderId
              ? { ...o, status }
              : o,
          );
          setOrders(updatedOrders);
          localStorage.setItem("app_orders", JSON.stringify(updatedOrders));
          showNotification(
            `Status pesanan diperbarui secara lokal (${errorCode === "permission-denied" ? "Akses Dibatasi" : "Data Cloud Tidak Ditemukan"})`,
          );
        } else {
          showNotification(`Gagal memperbarui: ${err.message || errorCode}`);
        }
      }
    } else {
      const updatedOrders = orders.map((o) =>
        String(o.id) === String(orderId) || o.firebaseKey === orderId
          ? { ...o, status }
          : o,
      );
      setOrders(updatedOrders);
      localStorage.setItem("app_orders", JSON.stringify(updatedOrders));
      showNotification("Status pesanan berhasil diperbarui (Mode Lokal)");
    }
  };

  const handleEditOrder = async (orderId: string, updatedData: any) => {
    // Check if it's a demo order
    const isDemoOrder = demoOrders.find(
      (o) => String(o.id) === String(orderId),
    );
    if (isDemoOrder) {
      setDemoOrders((prev) =>
        prev.map((o) =>
          String(o.id) === String(orderId) ? { ...o, ...updatedData } : o,
        ),
      );
      showNotification("Pesanan DUMMY berhasil diperbarui");
      return;
    }

    const order = orders.find(
      (o) => String(o.id) === String(orderId) || o.firebaseKey === orderId,
    );
    if (!order) return;

    if (updatedData.status !== undefined) {
      await updateInventoryStockForStatusChange(order, order.status, updatedData.status);
    }

    const actualId = String(order.firebaseKey || orderId);
    if (isFirebaseConfigured) {
      try {
        const orderRef = doc(db, "orders", actualId);
        await updateDoc(orderRef, updatedData);
        showNotification("Pesanan berhasil diperbarui");
      } catch (err: any) {
        console.error("Error editing order:", err);
        if (
          err.code === "permission-denied" ||
          err.message?.toLowerCase().includes("permission-denied") ||
          err.message?.toLowerCase().includes("insufficient permissions")
        ) {
          showNotification(
            "Akses ditolak: Anda harus login sebagai owner yang terverifikasi.",
          );
        } else if (
          err.code === "not-found" ||
          err.message?.includes("not-found")
        ) {
          console.log("Order not found in Firestore, updating locally");
          const updatedOrders = orders.map((o) =>
            String(o.id) === String(orderId) || o.firebaseKey === orderId
              ? { ...o, ...updatedData }
              : o,
          );
          setOrders(updatedOrders);
          localStorage.setItem("app_orders", JSON.stringify(updatedOrders));
          showNotification("Pesanan berhasil diperbarui (Lokal)");
        } else {
          showNotification(
            "Gagal memperbarui pesanan: " +
              (err.message || "Error tidak diketahui"),
          );
        }
        handleFirestoreError(err, OperationType.WRITE, "orders");
      }
    } else {
      setOrders((prev) => {
        const final = prev.map((o) =>
          String(o.id) === String(orderId) || o.firebaseKey === orderId
            ? { ...o, ...updatedData }
            : o,
        );
        localStorage.setItem("app_orders", JSON.stringify(final));
        return final;
      });
      showNotification("Pesanan berhasil diperbarui");
    }
  };

  const handleDeleteOrder = async (orderId: string | string[]) => {
    const idsToDelete = Array.isArray(orderId) ? orderId : [orderId];

    // Handle demo orders
    const demoIds = idsToDelete.filter((id) =>
      demoOrders.some((o) => String(o.id) === String(id)),
    );
    if (demoIds.length > 0) {
      setDemoOrders((prev) =>
        prev.map((o) =>
          demoIds.includes(String(o.id)) ? { ...o, isDeleted: true } : o,
        ),
      );
      if (demoIds.length === idsToDelete.length) {
        showNotification(
          Array.isArray(orderId)
            ? `${idsToDelete.length} pesanan DUMMY berhasil dihapus ke sampah`
            : "Pesanan DUMMY berhasil dihapus ke sampah",
        );
        return;
      }
    }

    if (isFirebaseConfigured) {
      try {
        const batch = writeBatch(db);
        idsToDelete.forEach((id) => {
          const order = orders.find(
            (o) => String(o.id) === String(id) || o.firebaseKey === id,
          );
          const actualId = order?.firebaseKey || id;
          // Soft delete: set isDeleted to true
          batch.update(doc(db, "orders", actualId), { isDeleted: true });
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "orders");
      }
    } else {
      setOrders((prevOrders) => {
        const updatedOrders = prevOrders.map((o) =>
          idsToDelete.includes(String(o.id)) ||
          idsToDelete.includes(o.firebaseKey as string)
            ? { ...o, isDeleted: true }
            : o,
        );
        localStorage.setItem("app_orders", JSON.stringify(updatedOrders));
        return updatedOrders;
      });
    }
    showNotification(
      idsToDelete.length > 1
        ? `${idsToDelete.length} pesanan dipindahkan ke Tempat Sampah.`
        : "Pesanan dipindahkan ke Tempat Sampah.",
    );
  };

  const handleRestoreOrder = async (orderId: string) => {
    // Check if it's a demo order
    const isDemoOrder = demoOrders.find(
      (o) => String(o.id) === String(orderId),
    );
    if (isDemoOrder) {
      setDemoOrders((prev) =>
        prev.map((o) =>
          String(o.id) === String(orderId) ? { ...o, isDeleted: false } : o,
        ),
      );
      showNotification("Pesanan DUMMY berhasil dipulihkan");
      return;
    }

    if (isFirebaseConfigured) {
      try {
        const order = orders.find(
          (o) => String(o.id) === String(orderId) || o.firebaseKey === orderId,
        );
        const actualId = order?.firebaseKey || orderId;
        await updateDoc(doc(db, "orders", actualId), { isDeleted: false });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "orders");
      }
    } else {
      setOrders((prevOrders) => {
        const updatedOrders = prevOrders.map((o) =>
          String(o.id) === String(orderId) || o.firebaseKey === orderId
            ? { ...o, isDeleted: false }
            : o,
        );
        localStorage.setItem("app_orders", JSON.stringify(updatedOrders));
        return updatedOrders;
      });
    }
    showNotification("Pesanan telah dipulihkan.");
  };

  const handlePermanentDelete = async (orderId: string) => {
    // Check if it's a demo order
    const isDemoOrder = demoOrders.find(
      (o) => String(o.id) === String(orderId),
    );
    if (isDemoOrder) {
      setDemoOrders((prev) =>
        prev.filter((o) => String(o.id) !== String(orderId)),
      );
      showNotification("Pesanan DUMMY berhasil dihapus permanen");
      return;
    }

    if (isFirebaseConfigured) {
      try {
        const order = orders.find(
          (o) => String(o.id) === String(orderId) || o.firebaseKey === orderId,
        );
        const actualId = order?.firebaseKey || orderId;
        await deleteDoc(doc(db, "orders", actualId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, "orders");
      }
    } else {
      setOrders((prevOrders) => {
        const updatedOrders = prevOrders.filter(
          (o) => String(o.id) !== String(orderId) && o.firebaseKey !== orderId,
        );
        localStorage.setItem("app_orders", JSON.stringify(updatedOrders));
        return updatedOrders;
      });
    }
    showNotification("Pesanan dihapus permanen.");
  };

  return (
    <ErrorBoundary>
      {showExitConfirmation && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
          <div className="bg-white rounded-3xl p-8 shadow-2xl w-full max-w-sm text-center">
            <h3 className="text-xl font-bold text-[#3D2B1F] mb-4">
              Keluar Aplikasi?
            </h3>
            <p className="text-stone-600 mb-8">
              Apakah Anda ingin keluar dari aplikasi?
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowExitConfirmation(false)}
                className="flex-1 py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setShowExitConfirmation(false);
                  if (view === "home") {
                    setView("welcome");
                  } else {
                    window.history.back();
                  }
                }}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-0 md:p-4 bg-[#211710]">
        <div className="w-full max-w-[430px] bg-[#F5F2EA] h-[100dvh] md:h-[884px] md:max-h-[95vh] flex flex-col relative shadow-2xl md:rounded-[3rem] overflow-hidden border-0 md:border-8 border-white/20">
          <AnimatePresence>
            {notification && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 20 }}
                exit={{ opacity: 0, y: -20 }}
                className={`absolute top-12 left-6 right-6 z-[100] ${notification.toLowerCase().includes("gagal") ? "bg-red-500" : "bg-[#3D2B1F]"} text-white p-4 rounded-2xl shadow-2xl text-center text-sm font-bold pointer-events-none`}
              >
                {notification}
              </motion.div>
            )}
          </AnimatePresence>
          {view === "welcome" && (
            <WelcomeScreen
              onStart={() => {
                if (userRole === "owner") {
                  setView("owner");
                } else {
                  setHomeActiveTab("home");
                  setView("home");
                }
              }}
            />
          )}
          {view === "owner" && (
            <OwnerScreen
              inventory={inventory}
              totalRevenue={totalRevenue}
              revenueToday={revenueToday}
              totalOrders={totalOrders}
              orders={allOrdersForOwner}
              feedbacks={feedbacks}
              showNotification={showNotification}
              setOrders={setOrders}
              setFeedbacks={setFeedbacks}
              isFirebaseConfigured={isFirebaseConfigured}
              isResettingData={isResettingData}
              setIsResettingData={setIsResettingData}
              isPerformingReset={isPerformingReset}
              setIsPerformingReset={setIsPerformingReset}
              onUpdateStock={async (id, newStock) => {
                console.log("Updating stock:", id, newStock);
                // Optimistically update local state
                setInventory((prev) =>
                  prev.map((item) =>
                    item.id === id ? { ...item, stock: newStock } : item,
                  ),
                );
                localStorage.setItem(
                  "app_inventory",
                  JSON.stringify(
                    inventory.map((item) =>
                      item.id === id ? { ...item, stock: newStock } : item,
                    ),
                  ),
                );

                if (isFirebaseConfigured) {
                  try {
                    const itemRef = doc(db, "inventory", String(id));
                    await updateDoc(itemRef, { stock: newStock });
                    console.log("Stock updated in Firestore");
                  } catch (err) {
                    console.error("Error updating stock in Firestore:", err);
                    handleFirestoreError(err, OperationType.WRITE, "inventory");
                  }
                } else {
                  console.log("Stock updated in localStorage");
                }
              }}
              onUpdateItem={async (updatedItem) => {
                if (isFirebaseConfigured) {
                  try {
                    const itemRef = doc(
                      db,
                      "inventory",
                      String(updatedItem.id),
                    );
                    await setDoc(itemRef, updatedItem);
                  } catch (err) {
                    handleFirestoreError(err, OperationType.WRITE, "inventory");
                  }
                } else {
                  const updatedInventory = inventory.map((item) =>
                    item.id === updatedItem.id ? updatedItem : item,
                  );
                  setInventory(updatedInventory);
                  localStorage.setItem(
                    "app_inventory",
                    JSON.stringify(updatedInventory),
                  );
                }
              }}
              onDeleteItem={async (id) => {
                if (isFirebaseConfigured) {
                  try {
                    await deleteDoc(doc(db, "inventory", String(id)));
                  } catch (err) {
                    handleFirestoreError(
                      err,
                      OperationType.DELETE,
                      "inventory",
                    );
                  }
                } else {
                  const updatedInventory = inventory.filter(
                    (item) => item.id !== id,
                  );
                  setInventory(updatedInventory);
                  localStorage.setItem(
                    "app_inventory",
                    JSON.stringify(updatedInventory),
                  );
                }
              }}
              onAddItem={async (newItem) => {
                if (isFirebaseConfigured) {
                  try {
                    await setDoc(
                      doc(db, "inventory", String(newItem.id)),
                      newItem,
                    );
                  } catch (err) {
                    handleFirestoreError(err, OperationType.WRITE, "inventory");
                  }
                } else {
                  const updatedInventory = [...inventory, newItem];
                  setInventory(updatedInventory);
                  localStorage.setItem(
                    "app_inventory",
                    JSON.stringify(updatedInventory),
                  );
                }
                showNotification("Menu baru ditambahkan.");
              }}
              onRestoreDefaults={async () => {
                if (isFirebaseConfigured) {
                  try {
                    const batch = writeBatch(db);
                    DEFAULT_INVENTORY.forEach((item) => {
                      batch.set(doc(db, "inventory", String(item.id)), item);
                    });
                    await batch.commit();
                  } catch (err) {
                    handleFirestoreError(err, OperationType.WRITE, "inventory");
                  }
                } else {
                  setInventory(DEFAULT_INVENTORY);
                  localStorage.setItem(
                    "app_inventory",
                    JSON.stringify(DEFAULT_INVENTORY),
                  );
                }
                showNotification("Stok dikembalikan ke default.");
              }}
              onLogout={handleLogout}
              onSwitchToCustomer={() => {
                setView("home");
              }}
              onOwnerLogin={handleOwnerLogin}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onDeleteOrder={handleDeleteOrder}
              onRestoreOrder={handleRestoreOrder}
              onPermanentDelete={handlePermanentDelete}
              onEditOrder={handleEditOrder}
              customerName={currentUser?.displayName || customerName}
              customerEmail={currentUser?.email || customerEmail}
              currentUser={currentUser}
              ownerSubView={ownerSubView}
              setOwnerSubView={setOwnerSubView}
              updatingOrderId={updatingOrderId}
              setUpdatingOrderId={setUpdatingOrderId}
              isAuthReady={isAuthReady}
              dismissedNotifs={dismissedNotifs}
              onDismissNotif={handleDismissNotif}
              showDemoOrdersOwner={showDemoOrdersOwner}
              setShowDemoOrdersOwner={setShowDemoOrdersOwner}
            />
          )}

          {/* New Order Alert Modal for Owner */}
          <AnimatePresence>
            {newOrderAlert && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
              >
                <motion.div
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  className="bg-white w-full max-w-[340px] rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col items-center p-8 text-center"
                >
                  <div className="h-24 w-24 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 mb-6 animate-bounce">
                    <BellRing size={48} />
                  </div>
                  <h2 className="text-2xl font-bold text-[#3D2B1F] mb-2">
                    Pesanan Baru!
                  </h2>
                  <p className="text-[#3D2B1F]/60 mb-6">
                    Ada pesanan masuk dari{" "}
                    <span className="font-bold text-[#3D2B1F]">
                      {newOrderAlert.customerName}
                    </span>{" "}
                    senilai{" "}
                    <span className="font-bold text-[#D4AF37]">
                      Rp {(newOrderAlert.total || 0).toLocaleString()}
                    </span>
                  </p>
                  <button
                    onClick={() => {
                      setNewOrderAlert(null);
                      if ((window as any)._orderAudio) {
                        (window as any)._orderAudio.pause();
                        (window as any)._orderAudio.currentTime = 0;
                        (window as any)._orderAudio = null;
                      }
                    }}
                    className="w-full bg-[#3D2B1F] text-white py-4 rounded-2xl font-bold text-lg shadow-xl active:scale-95 transition-all"
                  >
                    Terima Pesanan
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          {view === "home" && (
            <HomeScreen
              address={address}
              addresses={addresses}
              setAddresses={setAddresses}
              customerName={customerName}
              customerPhone={customerPhone}
              customerEmail={customerEmail}
              onCheckout={() => setView("checkout")}
              onSelectItem={handleSelectItem}
              hasActiveOrder={[...demoOrders, ...orders].some(
                (o) =>
                  !o.isDeleted &&
                  o.status !== "selesai" &&
                  o.status !== "dibatalkan" &&
                  (o.customerName === customerName ||
                    (currentUser && o.uid === currentUser.uid) ||
                    (currentUser && o.customerEmail === currentUser.email)),
              )}
              activeTab={homeActiveTab}
              setActiveTab={setHomeActiveTab}
              activeCategory={homeActiveCategory}
              setActiveCategory={setHomeActiveCategory}
              searchQuery={homeSearchQuery}
              setSearchQuery={setHomeSearchQuery}
              onAddressChange={(newAddr) => setAddress(newAddr)}
              onViewOrders={() => setView("orders")}
              cart={cart}
              userRole={userRole}
              onOpenOwnerDashboard={() => {
                localStorage.setItem("owner_active_tab", "beranda");
                setView("owner");
              }}
              onUpdateProfile={(name, phone, email) => {
                setCustomerName(name);
                setCustomerPhone(phone);
                setCustomerEmail(email);
                updateRoleAndDemo(email, currentUser);
              }}
              onLogout={handleLogout}
              onLogin={handleLogin}
              onOwnerLogin={handleOwnerLogin}
              currentUser={currentUser}
              onBackToWelcome={() => setView("welcome")}
              orders={[...demoOrders, ...orders]}
              onRemoveFromCart={handleRemoveFromCart}
              onEditCartItem={handleEditCartItem}
              onRateOrder={handleRateOrder}
              onDeleteOrder={handleDeleteOrder}
              ownerSubView={ownerSubView}
              setOwnerSubView={setOwnerSubView}
              feedbacks={feedbacks}
              isFirebaseConfigured={isFirebaseConfigured}
              setUserRole={setUserRole}
              dismissedNotifs={dismissedNotifs}
              onDismissNotif={handleDismissNotif}
              isDemoMode={isDemoMode}
              setIsDemoMode={setIsDemoMode}
            />
          )}
          {view === "detail" && (
            <DetailScreen
              item={selectedItem}
              onBack={() => setView("home")}
              onAddToCart={(cartDetails) => {
                setCart((prev) => {
                  const existingItemIndex = prev.findIndex(
                    (item) =>
                      item.item.id === cartDetails.item.id &&
                      JSON.stringify([...(item.toppings || [])].sort()) ===
                        JSON.stringify(
                          [...(cartDetails.toppings || [])].sort(),
                        ) &&
                      item.notes === cartDetails.notes,
                  );

                  if (existingItemIndex >= 0) {
                    const newCart = [...prev];
                    newCart[existingItemIndex].quantity += cartDetails.quantity;
                    newCart[existingItemIndex].totalPrice +=
                      cartDetails.totalPrice;
                    return newCart;
                  } else {
                    return [...prev, cartDetails];
                  }
                });
                setView("home");
                setNotification("Berhasil ditambahkan ke keranjang");
                setTimeout(() => setNotification(null), 3000);
              }}
              onBuyNow={(cartDetails) => {
                setCart((prev) => {
                  const existingItemIndex = prev.findIndex(
                    (item) =>
                      item.item.id === cartDetails.item.id &&
                      JSON.stringify([...(item.toppings || [])].sort()) ===
                        JSON.stringify(
                          [...(cartDetails.toppings || [])].sort(),
                        ) &&
                      item.notes === cartDetails.notes,
                  );

                  if (existingItemIndex >= 0) {
                    const newCart = [...prev];
                    newCart[existingItemIndex].quantity += cartDetails.quantity;
                    newCart[existingItemIndex].totalPrice +=
                      cartDetails.totalPrice;
                    return newCart;
                  } else {
                    return [...prev, cartDetails];
                  }
                });
                setView("checkout");
              }}
            />
          )}
          {view === "checkout" && (
            <CheckoutScreen
              address={address}
              onAddressChange={setAddress}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={(method) => {
                setPaymentMethod(method);
                if (method === "QRIS") {
                  showNotification("qris pembayaran");
                }
              }}
              cart={cart}
              onBack={() => setView("home")}
              onOrderPlaced={(name, phone, email, addr, isTestChecked) =>
                handlePlaceOrder(name, phone, email, addr, isTestChecked)
              }
              customerName={customerName}
              customerPhone={customerPhone}
              customerEmail={customerEmail}
              onUpdateProfile={(name, phone, email) => {
                setCustomerName(name);
                setCustomerPhone(phone);
                setCustomerEmail(email);
                updateRoleAndDemo(email, currentUser);
              }}
            />
          )}
          {view === "orders" && (
            <OrdersScreen
              onBack={() => setView("home")}
              onGoHome={(tab = "home") => {
                setHomeActiveTab(tab);
                setView("home");
              }}
              orders={[...demoOrders, ...orders]}
              customerName={customerName}
              currentUser={currentUser}
              cart={cart}
              onRateOrder={handleRateOrder}
              onNewOrder={() => setShowAppFeedbackModal(true)}
              onCancelOrder={handleCancelOrder}
              onDeleteOrder={handleDeleteOrder}
              isFirebaseConfigured={isFirebaseConfigured}
            />
          )}
          <AppFeedbackModal
            show={showAppFeedbackModal}
            onClose={async () => {
              if (currentOrderFirebaseKey) {
                await handleNotifyOrder(currentOrderFirebaseKey);
                setCurrentOrderFirebaseKey(null);
              }
              setShowAppFeedbackModal(false);
            }}
            onSubmit={async (rating, feedback) => {
              await handleAddAppFeedback(rating, feedback);
              if (currentOrderFirebaseKey) {
                await handleNotifyOrder(currentOrderFirebaseKey);
                setCurrentOrderFirebaseKey(null);
              }
            }}
          />
        </div>
      </div>
    </ErrorBoundary>
  );
}

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col h-full bg-[#F5F2EA]">
      <div className="flex-1 flex flex-col items-center px-8 pt-6 pb-8 overflow-y-auto overflow-x-hidden">
        <div className="relative flex flex-col items-center mb-6">
          <div className="relative flex h-80 w-80 items-center justify-center rounded-full bg-white/40 border border-[#3D2B1F]/10 shadow-sm">
            <div className="z-10 flex h-64 w-64 items-center justify-center rounded-full bg-[#3D2B1F] text-[#F5F2EA] shadow-2xl overflow-hidden">
              <img
                src="https://raw.githubusercontent.com/Dinni-hub/logo-indomi-nite/main/WhatsApp%20Image%202026-02-12%20at%2011.24.46.jpeg"
                alt="Indomi Nite Logo"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>

          <h1 className="text-4xl font-sans tracking-tight text-[#3D2B1F] mt-8 text-center leading-tight">
            Indomi Nite
          </h1>
          <p className="text-[#D4AF37] font-bold uppercase tracking-[0.2em] text-[11px] mt-2">
            Solusi Ngemil Anak Kampus
          </p>
          <div className="h-0.5 w-12 bg-[#D4AF37]/40 mt-4 mb-4 rounded-full"></div>
        </div>

        <div className="flex w-full flex-col gap-4 mb-12 mt-auto">
          <button
            onClick={() => onStart()}
            className="flex w-full items-center justify-center rounded-2xl h-16 bg-[#3D2B1F] text-[#F5F2EA] text-xl font-bold shadow-xl transition-colors hover:bg-black active:scale-95"
          >
            Masuk
          </button>
        </div>

        {/* Branding Footer */}
        <div className="w-full flex flex-col items-center mb-12">
          <div className="bg-white rounded-[1.5rem] p-4 w-full max-w-[350px] border border-[#3D2B1F]/10 shadow-sm flex flex-col items-center">
            <p className="text-[8px] font-bold uppercase tracking-[0.3em] text-[#3D2B1F]/50 mb-3">
              Proudly Powered By
            </p>
            <div className="flex items-center justify-center gap-6 w-full">
              <div className="h-14 w-14 flex items-center justify-center">
                <img
                  src="https://raw.githubusercontent.com/Dinni-hub/logo-istts/main/Logo.png"
                  alt="ISTTS Logo"
                  className="max-h-full max-w-full object-contain"
                  style={{ transform: "scale(1.1)" }}
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="h-8 w-px bg-[#3D2B1F]/10"></div>
              <div className="h-14 w-14 flex items-center justify-center">
                <img
                  src="https://raw.githubusercontent.com/Dinni-hub/logo-ai-campus-bg-putih/main/AI_Campus-removebg-preview.png"
                  alt="AI Campus Logo"
                  className="max-h-full max-w-full object-contain"
                  style={{ transform: "scale(1.5)" }}
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="h-8 w-px bg-[#3D2B1F]/10"></div>
              <div className="h-14 w-14 flex items-center justify-center">
                <img
                  src="https://raw.githubusercontent.com/Dinni-hub/logo/main/Logo%20MBD.png"
                  alt="MBD Logo"
                  className="max-h-full max-w-full object-contain"
                  style={{ transform: "scale(2.2)" }}
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] font-medium text-[#3D2B1F]/60 tracking-wide text-center">
            Karya Mahasiswa Manajemen Bisnis Digital ISTTS (AI Campus)
          </p>
        </div>
      </div>
      <div className="mb-3 flex w-full justify-center">
        <div className="h-1.5 w-36 rounded-full bg-[#3D2B1F]/20"></div>
      </div>
    </div>
  );
}

function OwnerScreen({
  inventory,
  totalRevenue,
  revenueToday,
  totalOrders,
  orders,
  feedbacks,
  onUpdateStock,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onRestoreDefaults,
  onLogout,
  onSwitchToCustomer,
  onUpdateOrderStatus,
  onDeleteOrder,
  onRestoreOrder,
  onPermanentDelete,
  onEditOrder,
  onOwnerLogin,
  setOrders,
  setFeedbacks,
  isFirebaseConfigured,
  isResettingData,
  setIsResettingData,
  isPerformingReset,
  setIsPerformingReset,
  customerName,
  customerEmail,
  currentUser,
  showNotification,
  ownerSubView,
  setOwnerSubView,
  updatingOrderId,
  setUpdatingOrderId,
  isAuthReady,
  dismissedNotifs,
  onDismissNotif,
  showDemoOrdersOwner,
  setShowDemoOrdersOwner,
}: {
  inventory: any[];
  totalRevenue: number;
  revenueToday: number;
  totalOrders: number;
  orders: Order[];
  feedbacks: AppFeedback[];
  onUpdateStock: (id: number, stock: number) => void;
  onUpdateItem: (item: any) => void;
  onDeleteItem: (id: number) => void;
  onAddItem: (item: any) => void;
  onRestoreDefaults: () => void;
  onLogout: () => void;
  onSwitchToCustomer: () => void;
  onUpdateOrderStatus: (
    orderId: string,
    status: "diterima" | "dimasak" | "diantar" | "selesai" | "dibatalkan",
  ) => void;
  onDeleteOrder: (orderId: string | string[]) => void;
  onRestoreOrder: (orderId: string) => void;
  onPermanentDelete: (orderId: string) => void;
  onEditOrder: (orderId: string, data: any) => void;
  onOwnerLogin: () => void;
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  setFeedbacks: React.Dispatch<React.SetStateAction<AppFeedback[]>>;
  isFirebaseConfigured: boolean;
  isResettingData: boolean;
  setIsResettingData: (v: boolean) => void;
  isPerformingReset: boolean;
  setIsPerformingReset: (v: boolean) => void;
  customerName: string;
  customerEmail: string;
  currentUser: any;
  showNotification: (msg: string) => void;
  ownerSubView: string | null;
  setOwnerSubView: (v: string | null) => void;
  updatingOrderId: string | null;
  setUpdatingOrderId: React.Dispatch<React.SetStateAction<string | null>>;
  isAuthReady: boolean;
  dismissedNotifs: string[];
  onDismissNotif: (id: string) => void;
  showDemoOrdersOwner: boolean;
  setShowDemoOrdersOwner: (show: boolean) => void;
}) {
  console.log("OwnerScreen rendering");

  const [activeTab, setActiveTab] = useState<
    | "beranda"
    | "laporan"
    | "stok"
    | "pengaturan"
    | "rating"
    | "sampah"
    | "kuesioner"
  >(() => {
    return getLocalStorageItem("owner_active_tab", "beranda") as any;
  });

  useEffect(() => {
    localStorage.setItem("owner_active_tab", activeTab);
  }, [activeTab]);

  // One-time un-gapper removed as it causes confusion in multi-user environment
  // and affects existing receipts already given to customers.

  const [aiKuesionerSummary, setAiKuesionerSummary] = useState<string | null>(
    null,
  );
  const [isGeneratingKuesionerSummary, setIsGeneratingKuesionerSummary] =
    useState(false);

  const [viewDetail, setViewDetail] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [targetOrderId, setTargetOrderId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    stock: 0,
    unit: "pcs",
    max: 100,
    min: 5,
    icon: "Package",
    color: "bg-orange-100 text-orange-600",
    imageUrl: "",
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Maksimal 2MB untuk Firebase Storage
    if (file.size > 2 * 1024 * 1024) {
      showNotification("Gagal: Ukuran file maksimal 2MB.");
      return;
    }

    setIsUploading(true);
    try {
      if (isFirebaseConfigured) {
        // 1. Upload ke Firebase Storage
        const fileName = `${Date.now()}_${file.name}`;
        const fileRef = ref(storage, `orders/${fileName}`);
        const snapshot = await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        if (targetOrderId) {
          // 2. Update dokumen pesanan yang sudah ada
          const orderRef = doc(db, "orders", targetOrderId);
          await updateDoc(orderRef, {
            attachmentUrl: downloadURL,
            fileUrl: downloadURL,
            attachmentType: file.type.startsWith("image/") ? "image" : "file",
            attachmentName: file.name,
          });
          showNotification("Berhasil melampirkan berkas ke pesanan.");
        } else {
          // 3. Buat dokumen pesanan manual baru
          const newOrderNumber = await getNextOrderNumber(
            isFirebaseConfigured,
            orders,
          );
          const newId = Date.now().toString();
          await setDoc(doc(db, "orders", newId), {
            id: newId,
            orderNumber: newOrderNumber,
            customerName: "Dokumen Rekap",
            items: [],
            total: 0,
            timestamp: serverTimestamp(),
            status: "selesai",
            paymentStatus: "lunas",
            isManual: true,
            attachmentUrl: downloadURL,
            fileUrl: downloadURL,
            attachmentType: file.type.startsWith("image/") ? "image" : "file",
            attachmentName: file.name,
            sessionId: "manual_upload",
          });
          showNotification("Berhasil mengunggah dokumen baru.");
        }
      } else {
        // Mode Lokal (Fallback)
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64Str = event.target?.result as string;
          const newId = Date.now().toString();
          const newAttachmentOrder: Order = {
            id: newId,
            orderNumber: "LOCAL",
            customerName: "Dokumen Rekap (Lokal)",
            items: [],
            total: 0,
            timestamp: new Date(),
            status: "selesai",
            paymentStatus: "lunas",
            isManual: true,
            attachmentUrl: base64Str,
            fileUrl: base64Str,
            attachmentType: file.type.startsWith("image/") ? "image" : "file",
            attachmentName: file.name,
          };
          setOrders((prev) => [newAttachmentOrder, ...prev]);
          showNotification("Berhasil diunggah (Mode Lokal)");
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.error("Upload Error:", err);
      showNotification("Gagal mengunggah file. Silakan cek koneksi.");
    } finally {
      setIsUploading(false);
      setTargetOrderId(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    const processImportData = async (data: any[]) => {
      try {
        const initialOrderNumStr = await getNextOrderNumber(
          isFirebaseConfigured,
          orders,
        );
        let currentOrderNum = parseInt(initialOrderNumStr, 10) || 1;

        const parseMenuShorthand = (row: any, orderTotal?: number) => {
          // Mengambil teks dari kolom Nama dan Menu untuk dianalisis
          const nameField = (row.Nama || row.nama || row.NAMA || "")
            .toString()
            .toLowerCase();
          const menuField = (
            row.Menu ||
            row.menu ||
            row.MENU ||
            row.Item ||
            row.item ||
            ""
          )
            .toString()
            .toLowerCase();
          const text = `${nameField} ${menuField}`.toLowerCase();

          // Mengambil Jumlah dan Harga dari baris data
          const rawQty =
            row.Jumlah ||
            row.jumlah ||
            row.JUMLAH ||
            row.Qty ||
            row.qty ||
            row.QTY ||
            1;
          const rawTotal =
            row.Total ||
            row.total ||
            row.TOTAL ||
            row.Subtotal ||
            row.subtotal ||
            0;
          const rawPrice =
            row.Harga ||
            row.harga ||
            row.HARGA ||
            row.Price ||
            row.price ||
            row.PRICE ||
            0;

          const quantity = Math.round(
            Number(rawQty?.toString().replace(/[^0-9]/g, "")) || 1,
          );
          const totalLine = Math.round(
            Number(rawTotal?.toString().replace(/[^0-9]/g, "")) || 0,
          );
          const unitPrice = Math.round(
            Number(rawPrice?.toString().replace(/[^0-9]/g, "")) ||
              (quantity > 0 ? totalLine / quantity : 0),
          );

          const items: any[] = [];

          // Kamus Pemetaan Menu Utama
          let baseItemName = "";
          if (text.includes("tgs")) {
            baseItemName = "Telur Gulung Sosis";
          } else if (text.includes("tg") || text.includes("telur gulung")) {
            baseItemName = "Telur Gulung";
          } else if (
            text.includes("goreng") ||
            text.includes("indomie goreng")
          ) {
            baseItemName = "Indomie Goreng";
          } else if (text.includes("soto") || text.includes("indomie soto")) {
            baseItemName = "Indomie Soto";
          } else if (
            text.includes("rendang") ||
            text.includes("indomie rendang")
          ) {
            baseItemName = "Indomie Rendang";
          }

          // Logika Add-on (Topping)
          const toppings: string[] = [];
          if (
            text.includes("telur") &&
            !text.includes("tg") &&
            !text.includes("tgs") &&
            !text.includes("telur gulung")
          )
            toppings.push("Telur");
          if (text.includes("sayur")) toppings.push("Sayur");
          if (text.includes("cabe")) toppings.push("Cabe");
          if (text.includes("sosis") && !text.includes("tgs"))
            toppings.push("Sosis");

          if (baseItemName) {
            const menuTemplate = ALL_MENU_ITEMS.find(
              (m) => m.name === baseItemName,
            );
            items.push({
              item: {
                name: baseItemName,
                price:
                  menuTemplate?.price || `Rp ${unitPrice.toLocaleString()}`,
                priceNum: menuTemplate?.priceNum || unitPrice,
              },
              quantity: quantity,
              toppings: toppings,
              totalPrice: totalLine || unitPrice * quantity || orderTotal || 0,
            });
          } else if (toppings.length > 0) {
            items.push({
              item: {
                name: "Menu Tambahan",
                price: `Rp ${unitPrice.toLocaleString()}`,
                priceNum: unitPrice,
              },
              quantity: quantity,
              toppings: toppings,
              totalPrice: totalLine || unitPrice * quantity || orderTotal || 0,
            });
          }

          return items;
        };

        const parseIndonesianDate = (
          dateStr: string,
          timeStr: string,
        ): Date => {
          const indonesianMonths: { [key: string]: string } = {
            januari: "Jan",
            februari: "Feb",
            maret: "Mar",
            april: "Apr",
            mei: "May",
            juni: "Jun",
            juli: "Jul",
            agustus: "Aug",
            september: "Sep",
            oktober: "Oct",
            november: "Nov",
            desember: "Dec",
            jan: "Jan",
            feb: "Feb",
            mar: "Mar",
            apr: "Apr",
            agu: "Aug",
            sep: "Sep",
            okt: "Oct",
            nov: "Nov",
            des: "Dec",
          };
          let normalizedDateStr = (dateStr || "").toString().toLowerCase();
          Object.keys(indonesianMonths).forEach((idMonth) => {
            normalizedDateStr = normalizedDateStr.replace(
              new RegExp(`\\b${idMonth}\\b`, "gi"),
              indonesianMonths[idMonth],
            );
          });
          const normalizedTimeStr = (timeStr || "")
            .toString()
            .replace(".", ":");

          let timestamp = new Date(`${normalizedDateStr} ${normalizedTimeStr}`);
          if (isNaN(timestamp.getTime()))
            timestamp = new Date(`${normalizedDateStr}T${normalizedTimeStr}`);

          if (
            !isNaN(timestamp.getTime()) &&
            timestamp.getFullYear() === 2001 &&
            !normalizedDateStr.includes("01") &&
            !normalizedDateStr.includes("2001")
          ) {
            timestamp.setFullYear(new Date().getFullYear());
          }

          if (isNaN(timestamp.getTime())) {
            const parts = normalizedDateStr.split(/[\/\-\s]+/);
            if (parts.length >= 3) {
              let day = parseInt(parts[0], 10);
              let monthIdx = parseInt(parts[1], 10) - 1;
              let year = parseInt(parts[2], 10);
              if (day > 1000) {
                year = day;
                day = parseInt(parts[2], 10);
              } else if (year < 100) {
                year += 2000;
              }
              const parsedHours = parseInt(
                normalizedTimeStr.split(":")[0] || "0",
                10,
              );
              const parsedMins = parseInt(
                normalizedTimeStr.split(":")[1] || "0",
                10,
              );
              timestamp = new Date(
                year,
                monthIdx,
                day,
                parsedHours,
                parsedMins,
              );
            }
          }
          return timestamp;
        };

        if (isFirebaseConfigured) {
          // Grouping logic: name + dateString
          const groupedOrders = new Map<string, any>();

          for (const row of data) {
            const name = (row.Nama || row.nama || row.NAMA || "Impor Historis")
              .toString()
              .toLowerCase()
              .trim();
            const dateStr = row.Tanggal || row.tanggal || row.TANGGAL;
            const timeStr = row.Jam || row.jam || row.JAM || "00:00";
            const totalVal = row.Total || row.total || row.TOTAL;
            let cleanTotalStr =
              totalVal
                ?.toString()
                .replace(/,00/g, "")
                .replace(/[^0-9]/g, "") || "0";
            const total = Math.round(Number(cleanTotalStr));

            if (!dateStr) continue;

            // New grouping logic: Nota/Invoice number
            let nota = (row.Nota || row.nota || row.NOTA || "")
              .toString()
              .trim();

            // If no nota, generate a temporary one based on name and date to avoid skipping
            if (!nota || nota === "") {
              const namePart = (row.Nama || row.nama || "import")
                .toString()
                .toLowerCase()
                .substring(0, 3);
              const dateRaw = (
                row.Tanggal ||
                row.tanggal ||
                "nodate"
              ).toString();
              const datePart = dateRaw.replace(/[^0-9]/g, "");
              nota =
                `IMP-${namePart}-${datePart || Date.now().toString().slice(-4)}-${Math.random().toString(36).substr(2, 4)}`.toUpperCase();
            }

            // Normalized Key based on Nota
            const key = nota;

            const orderItems = parseMenuShorthand(row, total);

            if (!groupedOrders.has(key)) {
              // Normalize time
              const dateStr = row.Tanggal || row.tanggal || row.TANGGAL;
              const timeStr = row.Jam || row.jam || row.JAM || "00:00";
              const name = (
                row.Nama ||
                row.nama ||
                row.NAMA ||
                "Impor Historis"
              )
                .toString()
                .trim();

              let timestamp = parseIndonesianDate(dateStr, timeStr);
              if (isNaN(timestamp.getTime())) timestamp = new Date(); // Fallback to now if invalid

              groupedOrders.set(key, {
                nota,
                name,
                timestamp,
                items: [],
                total: 0,
              });
            }

            const cluster = groupedOrders.get(key);
            cluster.items.push(...orderItems);
            cluster.total += total;
          }

          const batchSize = 500;
          const ordersArray = Array.from(groupedOrders.values());

          for (let i = 0; i < ordersArray.length; i += batchSize) {
            const batch = writeBatch(db);
            const chunk = ordersArray.slice(i, i + batchSize);

            for (const cluster of chunk) {
              const newId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const orderRef = doc(db, "orders", newId);

              let orderHpp = 0;
              cluster.items.forEach((i: any) => {
                orderHpp +=
                  getItemHPP(i.item.name, i.toppings || []) * i.quantity;
              });

              batch.set(orderRef, {
                id: newId,
                orderNumber: currentOrderNum.toString().padStart(2, "0"),
                customerName: cluster.name,
                items: cluster.items,
                total: cluster.total,
                calculatedProfit: Math.round(cluster.total * 0.3173),
                timestamp: cluster.timestamp,
                status: "selesai",
                paymentStatus: "lunas",
                isManual: true,
                sessionId: "bulk_import",
              });
              currentOrderNum++;
            }
            await batch.commit();
          }

          if (isFirebaseConfigured) {
            try {
              // We rely on the periodic sync logic to fix counters if needed,
              // or the target orders' dates to handle sequentiality correctly.
              // We don't blindly update today's counter here unless we know for sure it's for today.
              const today = new Date();
              const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

              // Only update if we know there were orders for today in the import
              const hasTodayOrders = ordersArray.some((c) => {
                const cDate =
                  c.timestamp instanceof Date
                    ? c.timestamp
                    : new Date(c.timestamp);
                return cDate.toDateString() === today.toDateString();
              });

              if (hasTodayOrders) {
                const todayMax = Math.max(
                  ...ordersArray
                    .filter((c) => {
                      const cDate =
                        c.timestamp instanceof Date
                          ? c.timestamp
                          : new Date(c.timestamp);
                      return cDate.toDateString() === today.toDateString();
                    })
                    .map((_, i) => (parseInt(initialOrderNumStr, 10) || 1) + i),
                );
                const counterRef = doc(db, "counters", dateStr);
                await setDoc(counterRef, { count: todayMax }, { merge: true });
              }
            } catch (err) {
              console.error("Failed to update counter after import", err);
            }
          }

          setReportFilterType("semua");
          showNotification("Data berhasil diimpor!");
        } else {
          // Mode Lokal
          const importedOrders: Order[] = data.map((row) => {
            const name = row.Nama || row.nama || row.NAMA || "Impor Historis";
            const dateStr = row.Tanggal || row.tanggal || row.TANGGAL;
            const timeStr = row.Jam || row.jam || row.JAM || "00:00";
            const totalVal = row.Total || row.total || row.TOTAL;
            let cleanTotalStr =
              totalVal
                ?.toString()
                .replace(/,00/g, "")
                .replace(/[^0-9]/g, "") || "0";
            const total = Math.round(Number(cleanTotalStr));

            const indonesianMonths: { [key: string]: string } = {
              januari: "Jan",
              februari: "Feb",
              maret: "Mar",
              april: "Apr",
              mei: "May",
              juni: "Jun",
              juli: "Jul",
              agustus: "Aug",
              september: "Sep",
              oktober: "Oct",
              november: "Nov",
              desember: "Dec",
              agu: "Aug",
              okt: "Oct",
              des: "Dec",
            };
            let normalizedDateStr = (dateStr || "").toString().toLowerCase();
            Object.keys(indonesianMonths).forEach((idMonth) => {
              normalizedDateStr = normalizedDateStr.replace(
                new RegExp(`\\b${idMonth}\\b`, "gi"),
                indonesianMonths[idMonth],
              );
            });

            const normalizedTimeStr = (timeStr || "")
              .toString()
              .replace(".", ":");

            let timestamp = new Date(
              `${normalizedDateStr} ${normalizedTimeStr}`,
            );
            if (isNaN(timestamp.getTime())) {
              timestamp = new Date(`${normalizedDateStr}T${normalizedTimeStr}`);
            }

            if (
              !isNaN(timestamp.getTime()) &&
              timestamp.getFullYear() === 2001 &&
              !normalizedDateStr.includes("01") &&
              !normalizedDateStr.includes("2001")
            ) {
              timestamp.setFullYear(new Date().getFullYear());
            }

            if (isNaN(timestamp.getTime())) {
              const parts = normalizedDateStr.split(/[\/\-\s]+/);
              if (parts.length >= 3) {
                let day = parseInt(parts[0], 10);
                let monthStr = parts[1];
                let month = parseInt(monthStr, 10) - 1;
                let year = parseInt(parts[2], 10);

                if (isNaN(month)) {
                  const m = new Date(`${monthStr} 1, 2000`).getMonth();
                  if (!isNaN(m)) month = m;
                }

                if (day > 1000) {
                  year = day;
                  day = parseInt(parts[2], 10);
                } else if (year < 100) {
                  year += 2000;
                }
                const timeParts = normalizedTimeStr.split(":");
                timestamp = new Date(
                  year,
                  month,
                  day,
                  parseInt(timeParts[0] || "0", 10),
                  parseInt(timeParts[1] || "0", 10),
                );
              }
            }

            if (isNaN(timestamp.getTime())) {
              timestamp = new Date();
            }

            const orderNumStr = currentOrderNum.toString().padStart(2, "0");
            currentOrderNum++;

            const orderItems = parseMenuShorthand(row, total);
            let orderHpp = 0;
            orderItems.forEach((i) => {
              orderHpp +=
                getItemHPP(i.item.name, i.toppings || []) * i.quantity;
            });

            return {
              id: `local_import_${Date.now()}_${Math.random()}`,
              orderNumber: orderNumStr,
              customerName: name,
              items: orderItems,
              total: total,
              timestamp: isNaN(timestamp.getTime()) ? new Date() : timestamp,
              status: "selesai",
              paymentStatus: "lunas",
              isManual: true,
              calculatedProfit: Math.round(total * 0.3173),
            };
          });
          setOrders((prev) => {
            const final = [...importedOrders, ...prev].sort((a, b) => {
              const timeA =
                a.timestamp instanceof Date
                  ? a.timestamp
                  : new Date(a.timestamp);
              const timeB =
                b.timestamp instanceof Date
                  ? b.timestamp
                  : new Date(b.timestamp);
              const timeDiff = timeB.getTime() - timeA.getTime();
              if (timeDiff !== 0) return timeDiff;
              const aId = a.firebaseKey || a.id || "";
              const bId = b.firebaseKey || b.id || "";
              return bId.localeCompare(aId);
            });
            localStorage.setItem("app_orders", JSON.stringify(final));
            return final;
          });
          setReportFilterType("semua");
          showNotification("Data berhasil diimpor!");
        }
      } catch (err) {
        console.error("Import Processing Error:", err);
        showNotification(
          `Gagal memproses data impor: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };

    // OCR/AI logic for images and documents
    const docTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];

    if (file.type.startsWith("image/") || docTypes.includes(file.type)) {
      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () =>
            resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const base64Data = await base64Promise;

        const responseSchema = {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              Nama: { type: Type.STRING },
              Tanggal: { type: Type.STRING },
              Jam: { type: Type.STRING },
              Total: { type: Type.NUMBER },
              Menu: { type: Type.STRING },
              Jumlah: { type: Type.NUMBER },
              Harga: { type: Type.NUMBER },
              Nota: { type: Type.STRING },
            },
            required: ["Nama", "Tanggal", "Jam", "Total"],
          },
        };

        const promptText = `Ekstrak data penjualan dari gambar screenshot atau dokumen ini secara detail. 
                PENTING: Ekstrak setiap baris produk sebagai objek terpisah.
                Format output HARUS berupa JSON Array of Objects dengan field: 
                - 'Nama' (Nama pelanggan)
                - 'Tanggal' (YYYY-MM-DD)
                - 'Jam' (HH:mm)
                - 'Total' (angka total transaksi per baris/item)
                - 'Menu' (nama produk)
                - 'Jumlah' (kuantitas)
                - 'Harga' (harga satuan)
                - 'Nota' (nomor nota/invoice jika ada, jika tidak ada kosongkan)
                
                Jika ada banyak baris pesanan dalam satu nota, pastikan field 'Nota' konsisten untuk baris-baris tersebut agar bisa dikelompokkan.
                Abaikan teks footer/header yang tidak relevan. 
                PASTIKAN 'Tanggal' menggunakan tahun ini (${new Date().getFullYear()}) jika tidak disebutkan secara eksplisit.`;

        // Gunakan client-side API untuk Google Gen AI sesuai guideline
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error("GEMINI_API_KEY tidak dikonfigurasi.");
        }

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    data: base64Data as string,
                    mimeType: file.type,
                  },
                },
                { text: promptText },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema,
          },
        });

        let text = response.text || "";
        if (text.includes("```")) {
          const matches = text.match(/```(?:json)?([\s\S]*?)```/);
          if (matches && matches[1]) {
            text = matches[1].trim();
          }
        }

        let results = [];
        try {
          results = JSON.parse(text);
        } catch (e) {
          throw new Error("Gagal mengurai respons AI.");
        }

        if (results && Array.isArray(results) && results.length > 0) {
          await processImportData(results);
        } else {
          showNotification(
            "Gagal: Tidak ada data penjualan yang terbaca di gambar.",
          );
        }
      } catch (err: any) {
        console.error("Image OCR Error Detail:", err);
        const errorMsg =
          err?.message || "Sistem AI tidak dapat membaca gambar tersebut.";
        showNotification(`Gagal: ${errorMsg}`);
      } finally {
        setIsUploading(false);
        if (csvInputRef.current) csvInputRef.current.value = "";
      }
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data as any[];
        if (data.length === 0) {
          showNotification("Gagal: File CSV kosong.");
          setIsUploading(false);
          return;
        }
        await processImportData(data);
        setIsUploading(false);
        if (csvInputRef.current) csvInputRef.current.value = "";
      },
      error: (err) => {
        console.error("File parsing error:", err);
        showNotification("Gagal membaca file CSV.");
        setIsUploading(false);
      },
    });
  };

  const handleAddItem = () => {
    if (!newItem.name) return;
    onAddItem({
      ...newItem,
      id: Date.now(),
      stock: Number(newItem.stock),
      max: Number(newItem.max),
      min: Number(newItem.min),
    });
    setIsAddItemModalOpen(false);
    setNewItem({
      name: "",
      stock: 0,
      unit: "pcs",
      max: 100,
      min: 5,
      icon: "Package",
      color: "bg-orange-100 text-orange-600",
      imageUrl: "",
    });
  };
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingStocks, setEditingStocks] = useState<{
    [id: number]: string;
  }>({});

  const [reportFilterType, setReportFilterType] = useState<
    "hari" | "minggu" | "bulan" | "semua"
  >(() => getLocalStorageItem("app_reportFilterType", "hari") as any);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    localStorage.setItem("app_reportFilterType", reportFilterType);
  }, [reportFilterType]);
  const [reportFilterDate, setReportFilterDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const localStr = `${year}-${month}-${day}`;
    return getLocalStorageItem("app_reportFilterDate", localStr);
  });
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [reportFilterMenu, setReportFilterMenu] = useState<string>(() =>
    getLocalStorageItem("app_reportFilterMenu", "semua"),
  );

  useEffect(() => {
    localStorage.setItem("app_reportFilterDate", reportFilterDate);
  }, [reportFilterDate]);

  useEffect(() => {
    localStorage.setItem("app_reportFilterMenu", reportFilterMenu);
  }, [reportFilterMenu]);

  const [isManualOrderModalOpen, setIsManualOrderModalOpen] = useState(false);
  const [manualOrderDate, setManualOrderDate] = useState(
    new Date().toISOString().slice(0, 16),
  );
  const [manualOrderError, setManualOrderError] = useState<string | null>(null);
  const [isSubmittingManualOrder, setIsSubmittingManualOrder] = useState(false);
  const isSubmittingManualOrderRef = useRef(false);
  const [manualOrderTotal, setManualOrderTotal] = useState("");
  const [manualOrderProfit, setManualOrderProfit] = useState("");
  const [manualOrderCustomerName, setManualOrderCustomerName] = useState("");
  const [manualOrderCustomerPhone, setManualOrderCustomerPhone] = useState("");
  const [manualOrderPaymentMethod, setManualOrderPaymentMethod] =
    useState("TUNAI");
  const [manualOrderItems, setManualOrderItems] = useState<CartItem[]>([]);
  const [manualOrderSelectedItemId, setManualOrderSelectedItemId] = useState<
    number | null
  >(null);
  const [manualOrderSelectedToppings, setManualOrderSelectedToppings] =
    useState<string[]>([]);
  const [customToppingName, setCustomToppingName] = useState("");
  const [customToppingPrice, setCustomToppingPrice] = useState("");
  const [isAddingCustomTopping, setIsAddingCustomTopping] = useState(false);
  const [localToppingPrices, setLocalToppingPrices] = useState<{
    [key: string]: number;
  }>({});
  const [manualOrderItemQuantity, setManualOrderItemQuantity] = useState<
    number | string
  >(1);
  const [editingSalesOrder, setEditingSalesOrder] = useState<Order | null>(
    null,
  );
  const [feedbackToDelete, setFeedbackToDelete] = useState<{
    id: string;
    type: "Order" | "Aplikasi" | "Kuesioner";
  } | null>(null);

  const [isEditNominalModalOpen, setIsEditNominalModalOpen] = useState(false);
  const [editNominalTarget, setEditNominalTarget] = useState<
    "hari" | "minggu" | "bulan" | "semua"
  >("hari");
  const [editNominalOmzet, setEditNominalOmzet] = useState("");
  const [editNominalProfit, setEditNominalProfit] = useState("");
  const [isMassDeleteModalOpen, setIsMassDeleteModalOpen] = useState(false);

  // Calculate total profit based on HPP
  const totalProfit = useMemo(() => {
    const validOrders = orders.filter(
      (o) => o.status !== "dibatalkan" && !o.isDeleted,
    );
    return validOrders.reduce((totalProfit, order) => {
      if (order.isManual) {
        return (
          totalProfit +
          (order.manualProfit || Math.round((order.total || 0) * 0.3173))
        );
      }

      return totalProfit + Math.round((order.total || 0) * 0.3173);
    }, 0);
  }, [orders]);

  const filteredReportData = useMemo(() => {
    // validOrders excludes dibatalkan for calculations.
    const validOrders = orders.filter(
      (o) => o.status !== "dibatalkan" && !o.isDeleted,
    );
    // Base orders for Riwayat includes dibatalkan.
    const baseRiwayatOrders = orders.filter((o) => !o.isDeleted);

    const [year, month, day] = reportFilterDate.split("-").map(Number);
    const selectedDate = new Date(year, month - 1, day);

    let filteredOrders = validOrders;
    let riwayatOrders = baseRiwayatOrders;

    // Apply Menu Filter First
    if (reportFilterMenu !== "semua") {
      filteredOrders = validOrders
        .map((o) => {
          if (o.isManual && o.sessionId === "manual_adjustment") return null; // Exclude manual adjustments, but keep bulk_import
          const matchingItems = (o.items || []).filter(
            (i) =>
              i.item &&
              i.item.name.toLowerCase() === reportFilterMenu.toLowerCase(),
          );
          if (matchingItems.length === 0) return null;

          let itemTotal = 0;
          let itemHpp = 0;
          matchingItems.forEach((cartItem) => {
            itemTotal += cartItem.totalPrice;
            itemHpp +=
              getItemHPP(cartItem.item.name, cartItem.toppings || []) *
              cartItem.quantity;
          });

          return {
            ...o,
            total: itemTotal,
            calculatedProfit: Math.round(itemTotal * 0.3173),
          };
        })
        .filter(Boolean) as any[];

      riwayatOrders = baseRiwayatOrders.filter((o) => {
        if (o.isManual && o.sessionId === "manual_adjustment") return false;
        const matchingItems = (o.items || []).filter(
          (i) =>
            i.item &&
            i.item.name.toLowerCase() === reportFilterMenu.toLowerCase(),
        );
        return matchingItems.length > 0;
      });
    } else {
      filteredOrders = validOrders.map((o) => {
        return {
          ...o,
          calculatedProfit: Math.round(o.total * 0.3173),
        };
      });
    }

    let chartData: any[] = [];

    if (reportFilterType === "hari") {
      filteredOrders = filteredOrders.filter(
        (o) => o.timestamp.toDateString() === selectedDate.toDateString(),
      );
      riwayatOrders = riwayatOrders.filter(
        (o) => o.timestamp.toDateString() === selectedDate.toDateString(),
      );

      const totalSales = filteredOrders.reduce((sum, o) => sum + o.total, 0);
      const totalProfit = filteredOrders.reduce(
        (sum, o) => sum + o.calculatedProfit,
        0,
      );

      chartData = [
        {
          name: selectedDate.toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
          sales: totalSales,
          profit: totalProfit,
        },
      ];
    } else if (reportFilterType === "minggu") {
      // Get start of week (Sunday)
      const startOfWeek = new Date(selectedDate);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      filteredOrders = filteredOrders.filter(
        (o) => o.timestamp >= startOfWeek && o.timestamp <= endOfWeek,
      );
      riwayatOrders = riwayatOrders.filter(
        (o) => o.timestamp >= startOfWeek && o.timestamp <= endOfWeek,
      );

      // Group by day of week
      const dailySales: { [key: number]: number } = {};
      const dailyProfit: { [key: number]: number } = {};

      filteredOrders.forEach((order) => {
        const d = order.timestamp.getDay();
        dailySales[d] = (dailySales[d] || 0) + order.total;
        dailyProfit[d] = (dailyProfit[d] || 0) + order.calculatedProfit;
      });

      const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
      chartData = days.map((day, idx) => ({
        name: day,
        sales: dailySales[idx] || 0,
        profit: dailyProfit[idx] || 0,
      }));
    } else if (reportFilterType === "bulan") {
      filteredOrders = filteredOrders.filter(
        (o) =>
          o.timestamp.getMonth() === selectedDate.getMonth() &&
          o.timestamp.getFullYear() === selectedDate.getFullYear(),
      );
      riwayatOrders = riwayatOrders.filter(
        (o) =>
          o.timestamp.getMonth() === selectedDate.getMonth() &&
          o.timestamp.getFullYear() === selectedDate.getFullYear(),
      );

      const totalSales = filteredOrders.reduce((sum, o) => sum + o.total, 0);
      const totalProfit = filteredOrders.reduce(
        (sum, o) => sum + o.calculatedProfit,
        0,
      );

      // Detailed daily chart for month
      const daysInMonth = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth() + 1,
        0,
      ).getDate();
      const dailyS: { [key: number]: number } = {};
      const dailyP: { [key: number]: number } = {};

      filteredOrders.forEach((order) => {
        const d = order.timestamp.getDate();
        dailyS[d] = (dailyS[d] || 0) + order.total;
        dailyP[d] = (dailyP[d] || 0) + order.calculatedProfit;
      });

      chartData = Array.from({ length: daysInMonth }, (_, i) => i + 1).map(
        (d) => ({
          name: d.toString(),
          sales: dailyS[d] || 0,
          profit: dailyP[d] || 0,
        }),
      );
    } else if (reportFilterType === "semua") {
      // No date filtering
      const totalSales = filteredOrders.reduce((sum, o) => sum + o.total, 0);
      const totalProfit = filteredOrders.reduce(
        (sum, o) => sum + o.calculatedProfit,
        0,
      );

      // Group by month for all-time
      const monthlyS: { [key: string]: number } = {};
      const monthlyP: { [key: string]: number } = {};

      filteredOrders.forEach((order) => {
        const key = `${order.timestamp.getFullYear()}-${order.timestamp.getMonth()}`;
        monthlyS[key] = (monthlyS[key] || 0) + order.total;
        monthlyP[key] = (monthlyP[key] || 0) + order.calculatedProfit;
      });

      // Get unique months from orders
      const months = Array.from(
        new Set(
          filteredOrders.map(
            (o) => `${o.timestamp.getFullYear()}-${o.timestamp.getMonth()}`,
          ),
        ),
      ).sort((a, b) => {
        const [yA, mA] = a.split("-").map(Number);
        const [yB, mB] = b.split("-").map(Number);
        return yA !== yB ? yA - yB : mA - mB;
      });

      chartData = months.map((key) => {
        const [year, month] = key.split("-").map(Number);
        return {
          name: new Date(year, month).toLocaleDateString("id-ID", {
            month: "short",
          }),
          sales: monthlyS[key] || 0,
          profit: monthlyP[key] || 0,
        };
      });

      if (chartData.length === 0) {
        chartData = [{ name: "Semua", sales: totalSales, profit: totalProfit }];
      }
    }

    const revenue = filteredOrders.reduce(
      (sum, order) => sum + (order.total || 0),
      0,
    );
    const profit = filteredOrders.reduce(
      (sum, order) => sum + (order.calculatedProfit || 0),
      0,
    );

    const realOrdersCount = filteredOrders.filter(
      (o) => !String(o.id).startsWith("ADJ-"),
    ).length;

    return {
      revenue,
      profit,
      chartData,
      ordersCount: realOrdersCount,
      filteredOrders,
      riwayatOrders,
    };
  }, [orders, reportFilterType, reportFilterDate, reportFilterMenu]);

  const handleSaveEditNominal = async () => {
    const newOmzet = parseInt(editNominalOmzet) || 0;
    const newProfit = parseInt(editNominalProfit) || 0;

    let currentOmzet = 0;
    let currentProfit = 0;

    if (editNominalTarget === "semua") {
      currentOmzet = totalRevenue;
      currentProfit = totalProfit;
    } else {
      currentOmzet = filteredReportData.revenue;
      currentProfit = filteredReportData.profit;
    }

    const diffOmzet = newOmzet - currentOmzet;
    const diffProfit = newProfit - currentProfit;

    if (diffOmzet === 0 && diffProfit === 0) {
      setIsEditNominalModalOpen(false);
      return;
    }

    let adjDate = new Date();
    if (editNominalTarget !== "semua") {
      const filterDate = new Date(reportFilterDate);
      if (filterDate.toDateString() !== new Date().toDateString()) {
        adjDate = filterDate;
        adjDate.setHours(12, 0, 0, 0);
      }
    }

    const orderNumber = await getNextOrderNumber(
      isFirebaseConfigured,
      orders,
      adjDate,
    );

    const newOrder: Order = {
      id: `ADJ-${Date.now()}`,
      orderNumber: orderNumber,
      customerName: `Penyesuaian Manual (${editNominalTarget})`,
      paymentMethod: "Tunai",
      items: [],
      total: diffOmzet,
      timestamp: adjDate,
      status: "selesai",
      paymentStatus: "lunas",
      isManual: true,
      manualProfit: diffProfit,
    };

    if (isFirebaseConfigured) {
      try {
        await addDoc(collection(db, "orders"), {
          ...newOrder,
          timestamp: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "orders");
      }
    } else {
      const updatedOrders = [...orders, newOrder];
      setOrders(updatedOrders);
      localStorage.setItem("app_orders", JSON.stringify(updatedOrders));
    }

    setIsEditNominalModalOpen(false);
  };

  const getToppingsForItem = (itemName: string) => {
    return itemName === "Telur Gulung" || itemName === "Telur Gulung Sosis"
      ? [
          { name: "Saus Tomat", defaultPrice: 0 },
          { name: "Saus Sambal", defaultPrice: 0 },
        ]
      : [
          { name: "Telur", defaultPrice: 4000 },
          { name: "Sayur", defaultPrice: 0 },
          { name: "Cabe", defaultPrice: 0 },
          { name: "Sosis", defaultPrice: 1000 },
        ];
  };

  const calculateManualOrderTotals = (items: CartItem[]) => {
    const newTotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
    setManualOrderTotal(newTotal.toString());
    setManualOrderProfit(Math.round(newTotal * 0.3173).toString());
  };

  const updateEditingOrderItems = (newItems: CartItem[]) => {
    if (!editingOrder) return;
    let newTotal = 0;
    let totalHpp = 0;
    newItems.forEach((cartItem) => {
      const uPrice =
        cartItem.item.priceNum ||
        parseInt(
          cartItem.item.price?.toString().replace(/[^0-9]/g, "") || "0",
        ) ||
        0;
      const currentToppings =
        cartItem.toppings || cartItem.accumulatedToppings || [];
      const toppingsTotal = currentToppings.reduce((sum, t) => {
        const tInfo = getToppingsForItem(cartItem.item.name).find(
          (x) => x.name === t,
        );
        return sum + (tInfo ? tInfo.defaultPrice : 0);
      }, 0);

      const totalPrice = uPrice * cartItem.quantity + toppingsTotal;
      newTotal += totalPrice;
    });

    setEditingOrder({
      ...editingOrder,
      items: newItems,
      total: newTotal,
      manualProfit: Math.round(newTotal * 0.3173),
    });
  };

  const getNewManualOrderItem = (): CartItem | null => {
    if (manualOrderSelectedItemId === null) return null;
    const item = ALL_MENU_ITEMS.find((i) => i.id === manualOrderSelectedItemId);
    if (!item) return null;

    let pricePerItem = 0;
    let finalItem = { ...item };

    if (item.name === "Add on") {
      const customName = prompt("Masukkan nama Add-on:", "Add-on Custom");
      if (!customName) return null; // Cancelled
      const customPriceStr = prompt(
        `Masukkan harga untuk ${customName} (angka saja):`,
        "0",
      );
      if (customPriceStr === null) return null; // Cancelled

      const parsedPrice = parseInt(customPriceStr.replace(/[^0-9]/g, ""), 10);
      pricePerItem = isNaN(parsedPrice) ? 0 : parsedPrice;

      finalItem.name = customName;
      finalItem.price = `Rp ${pricePerItem.toLocaleString()}`;
      finalItem.priceNum = pricePerItem;
    } else {
      const formattedToppings = manualOrderSelectedToppings.map((tName) => {
        const fixedToppings = getToppingsForItem(item.name);
        const tt = fixedToppings.find((x) => x.name === tName);
        const customP = localToppingPrices[tName];
        const activePrice =
          customP !== undefined ? customP : tt?.defaultPrice || 0;
        return activePrice > 0 ? `${tName} +Rp ${activePrice}` : tName;
      });
      pricePerItem = calculateItemPrice(
        item.name,
        item.priceNum || 0,
        formattedToppings,
      );
      const toppingsTotal = formattedToppings.reduce(
        (acc, t) => acc + getToppingPrice(t),
        0,
      );
      const q =
        typeof manualOrderItemQuantity === "number"
          ? manualOrderItemQuantity
          : parseInt(manualOrderItemQuantity as string) || 1;

      return {
        item: finalItem,
        quantity: q,
        toppings: formattedToppings,
        totalPrice: (item.priceNum || 0) * q + toppingsTotal,
      };
    }

    const q =
      typeof manualOrderItemQuantity === "number"
        ? manualOrderItemQuantity
        : parseInt(manualOrderItemQuantity as string) || 1;
    return {
      item: finalItem,
      quantity: q,
      toppings: [],
      totalPrice: pricePerItem * q,
    };
  };

  const addManualOrderItem = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const newItem = getNewManualOrderItem();
    if (!newItem) {
      setManualOrderError("Pilih menu terlebih dahulu untuk ditambahkan.");
      return;
    }

    setManualOrderError(null);

    const updatedItems = [...manualOrderItems, newItem];
    setManualOrderItems(updatedItems);
    calculateManualOrderTotals(updatedItems);

    // Reset selection
    setManualOrderSelectedItemId(null);
    setManualOrderSelectedToppings([]);
    setManualOrderItemQuantity(1);
  };

  const removeManualOrderItem = (index: number) => {
    const updatedItems = manualOrderItems.filter((_, i) => i !== index);
    setManualOrderItems(updatedItems);
    calculateManualOrderTotals(updatedItems);
  };

  const handleEditToppingPrice = (
    toppingName: string,
    currentPrice: number,
  ) => {
    const newPrice = prompt(
      `Edit harga manual untuk '${toppingName}' (Ketik angka saja):`,
      currentPrice.toString(),
    );
    if (newPrice !== null && newPrice.trim() !== "") {
      const parsed = parseInt(newPrice.replace(/[^0-9]/g, ""), 10);
      if (!isNaN(parsed)) {
        setLocalToppingPrices((prev) => ({ ...prev, [toppingName]: parsed }));

        // Update items in cart directly
        setManualOrderItems((prevItems) => {
          let hasChanges = false;
          const updated = prevItems.map((item) => {
            let itemMatched = false;
            const newTops = item.toppings.map((tStr) => {
              if (tStr.startsWith(toppingName)) {
                itemMatched = true;
                return parsed > 0
                  ? `${toppingName} +Rp ${parsed}`
                  : toppingName;
              }
              return tStr;
            });

            if (itemMatched) {
              hasChanges = true;
              const toppingsTotal = newTops.reduce(
                (acc, t) => acc + getToppingPrice(t),
                0,
              );
              return {
                ...item,
                toppings: newTops,
                totalPrice:
                  (item.item.priceNum || 0) * item.quantity + toppingsTotal,
              };
            }
            return item;
          });

          if (hasChanges) {
            setTimeout(() => calculateManualOrderTotals(updated), 0);
          }
          return updated;
        });
      }
    }
  };

  const handleEditSalesOrder = async () => {
    try {
      if (!editingSalesOrder) {
        setManualOrderError("Data pesanan tidak ditemukan.");
        return;
      }
      if (!manualOrderTotal) {
        setManualOrderError(
          "Total (Rp) wajib diisi. Silakan isi angka total pesanan.",
        );
        return;
      }
      if (!manualOrderDate) {
        setManualOrderError("Tanggal wajib dipilih.");
        return;
      }

      let currentItems = [...manualOrderItems];

      // Auto-add if list is empty but item is selected
      if (currentItems.length === 0) {
        const pendingItem = getNewManualOrderItem();
        if (pendingItem) {
          currentItems = [pendingItem];
        }
      }

      setManualOrderError(null);

      const updatedOrder: Order = {
        ...editingSalesOrder,
        customerName:
          manualOrderCustomerName ||
          editingSalesOrder.customerName ||
          "Pelanggan",
        customerPhone:
          manualOrderCustomerPhone || editingSalesOrder.customerPhone || "-",
        paymentMethod: manualOrderPaymentMethod || "TUNAI",
        items: currentItems,
        total: parseInt(manualOrderTotal) || 0,
        timestamp: manualOrderDate
          ? new Date(manualOrderDate)
          : editingSalesOrder.timestamp,
        isManual: true,
        manualProfit: manualOrderProfit ? parseInt(manualOrderProfit) : 0,
      };

      if (isFirebaseConfigured) {
        try {
          const key = String(updatedOrder.firebaseKey || updatedOrder.id);
          const orderRef = doc(db, "orders", key);
          await setDoc(orderRef, {
            ...updatedOrder,
            timestamp: updatedOrder.timestamp,
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, "orders");
        }
      } else {
        const updatedOrders = orders.map((o) =>
          o.id === updatedOrder.id ? updatedOrder : o,
        );
        setOrders(updatedOrders);
        localStorage.setItem("app_orders", JSON.stringify(updatedOrders));
      }

      showNotification("Perubahan Berhasil Disimpan!");
      setEditingSalesOrder(null);
      setManualOrderTotal("");
      setManualOrderProfit("");
      setManualOrderCustomerName("");
      setManualOrderCustomerPhone("");
      setManualOrderPaymentMethod("TUNAI");
      setManualOrderItems([]);
      setManualOrderDate(new Date().toISOString().slice(0, 16));
      setManualOrderError(null);
    } catch (err) {
      console.error("Error saving manual order:", err);
      setManualOrderError("Gagal menyimpan perubahan. Silakan coba lagi.");
    }
  };

  const openEditSalesOrderModal = (order: Order) => {
    setEditingSalesOrder(order);
    setManualOrderError(null);

    // Safely get timestamp as Date
    const timestamp =
      order.timestamp && typeof (order.timestamp as any).toDate === "function"
        ? (order.timestamp as any).toDate()
        : order.timestamp instanceof Date
          ? order.timestamp
          : new Date(order.timestamp);

    setManualOrderDate(
      new Date(timestamp.getTime() - timestamp.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    );
    setManualOrderTotal(order.total.toString());
    setManualOrderCustomerName(order.customerName);
    setManualOrderCustomerPhone(order.customerPhone || "");
    setManualOrderPaymentMethod(order.paymentMethod || "TUNAI");
    setManualOrderItems(order.items || []);

    let calculatedProfit = Math.round(order.total * 0.3173);
    setManualOrderProfit(calculatedProfit.toString());
  };

  const handleAddManualOrder = async () => {
    if (isSubmittingManualOrderRef.current) return;
    if (!manualOrderTotal) {
      setManualOrderError(
        "Total (Rp) wajib diisi. Silakan isi angka total pesanan.",
      );
      return;
    }
    if (!manualOrderDate) {
      setManualOrderError("Tanggal wajib dipilih.");
      return;
    }

    isSubmittingManualOrderRef.current = true;
    setIsSubmittingManualOrder(true);
    try {
      let currentItems = [...manualOrderItems];

      // Auto-add if list is empty but item is selected
      if (currentItems.length === 0) {
        const pendingItem = getNewManualOrderItem();
        if (pendingItem) {
          currentItems = [pendingItem];
        } else {
          setManualOrderError(
            "Harap pilih menu dan klik tombol (+) atau pilih menu terlebih dahulu.",
          );
          isSubmittingManualOrderRef.current = false;
          setIsSubmittingManualOrder(false);
          return;
        }
      }

      setManualOrderError(null);

      const customDate = manualOrderDate
        ? new Date(manualOrderDate)
        : new Date();
      const orderNumber = await getNextOrderNumber(
        isFirebaseConfigured,
        orders,
        customDate,
      );

      const newOrder: Order = {
        id: `MANUAL-${Date.now()}`,
        orderNumber: orderNumber,
        customerName: manualOrderCustomerName || "Penjualan Manual",
        customerPhone: manualOrderCustomerPhone || "",
        paymentMethod: manualOrderPaymentMethod,
        items: currentItems,
        total: parseInt(manualOrderTotal),
        timestamp: customDate,
        status: "selesai",
        paymentStatus: "lunas",
        isManual: true,
        manualProfit: manualOrderProfit ? parseInt(manualOrderProfit) : 0,
      };

      if (isFirebaseConfigured) {
        try {
          addDoc(collection(db, "orders"), {
            ...newOrder,
            timestamp: newOrder.timestamp,
          }).catch((err) => console.error("Error saving manual order:", err));

          // Update Inventory in Firestore using increment for better sync
          const batch = writeBatch(db);
          const inventoryDeductions: { [key: string]: number } = {};

          currentItems.forEach((cartItem) => {
            // Main Item
            let mainItemId = "";
            if (cartItem.item.name === "Indomie Goreng") mainItemId = "1";
            else if (cartItem.item.name === "Indomie Soto") mainItemId = "10";
            else if (cartItem.item.name === "Indomie Rendang")
              mainItemId = "11";
            else if (cartItem.item.name === "Telur Gulung") {
              inventoryDeductions["2"] =
                (inventoryDeductions["2"] || 0) + cartItem.quantity; // Telur
            } else if (cartItem.item.name === "Telur Gulung Sosis") {
              inventoryDeductions["2"] =
                (inventoryDeductions["2"] || 0) + cartItem.quantity; // Telur
              inventoryDeductions["9"] =
                (inventoryDeductions["9"] || 0) + cartItem.quantity; // Sosis
            }

            if (mainItemId) {
              inventoryDeductions[mainItemId] =
                (inventoryDeductions[mainItemId] || 0) + cartItem.quantity;
            }

            // Toppings
            if (cartItem.toppings && Array.isArray(cartItem.toppings)) {
              cartItem.toppings.forEach((topping) => {
                if (topping.includes("Telur"))
                  inventoryDeductions["2"] =
                    (inventoryDeductions["2"] || 0) + cartItem.quantity;
                if (topping.includes("Sosis"))
                  inventoryDeductions["9"] =
                    (inventoryDeductions["9"] || 0) + cartItem.quantity;
              });
            }

            // Packaging
            if (cartItem.item.name === "Indomie Soto") {
              inventoryDeductions["13"] =
                (inventoryDeductions["13"] || 0) + cartItem.quantity; // Bowl
              inventoryDeductions["14"] =
                (inventoryDeductions["14"] || 0) + cartItem.quantity; // Sendok
              inventoryDeductions["6"] =
                (inventoryDeductions["6"] || 0) + cartItem.quantity; // Garpu
              inventoryDeductions["12"] =
                (inventoryDeductions["12"] || 0) + cartItem.quantity; // Plastik
            } else if (
              cartItem.item.name === "Indomie Goreng" ||
              cartItem.item.name === "Indomie Rendang"
            ) {
              inventoryDeductions["5"] =
                (inventoryDeductions["5"] || 0) + cartItem.quantity; // Packaging Box Kertas
              inventoryDeductions["6"] =
                (inventoryDeductions["6"] || 0) + cartItem.quantity; // Garpu
              inventoryDeductions["12"] =
                (inventoryDeductions["12"] || 0) + cartItem.quantity; // Plastik
            } else if (
              cartItem.item.name === "Telur Gulung" ||
              cartItem.item.name === "Telur Gulung Sosis"
            ) {
              inventoryDeductions["4"] =
                (inventoryDeductions["4"] || 0) + cartItem.quantity; // Tusuk Sate
              inventoryDeductions["12"] =
                (inventoryDeductions["12"] || 0) + cartItem.quantity; // Plastik
            }
          });

          Object.entries(inventoryDeductions).forEach(([id, amount]) => {
            batch.update(doc(db, "inventory", id), {
              stock: increment(-amount),
            });
          });

          batch.commit().catch((err) => {
            console.warn("Failed to update inventory in Firestore:", err);
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, "orders");
        }
      } else {
        const updatedOrders = [newOrder, ...orders];
        setOrders(updatedOrders);
        localStorage.setItem("app_orders", JSON.stringify(updatedOrders));
      }

      setIsManualOrderModalOpen(false);
      setManualOrderTotal("");
      setManualOrderProfit("");
      setManualOrderCustomerName("");
      setManualOrderCustomerPhone("");
      setManualOrderPaymentMethod("TUNAI");
      setManualOrderItems([]);
      setManualOrderDate(new Date().toISOString().slice(0, 16));
      setManualOrderError(null);
    } finally {
      isSubmittingManualOrderRef.current = false;
      setIsSubmittingManualOrder(false);
    }
  };

  useEffect(() => {
    if (manualOrderItems.length === 0) {
      const pendingItem = getNewManualOrderItem();
      if (pendingItem) {
        calculateManualOrderTotals([pendingItem]);
      } else {
        setManualOrderTotal("");
        setManualOrderProfit("");
      }
    }
  }, [
    manualOrderSelectedItemId,
    manualOrderItemQuantity,
    manualOrderSelectedToppings,
    manualOrderItems.length,
  ]);

  const handleShareWhatsApp = (order: Order) => {
    const text = encodeURIComponent(generateReceiptText(order));
    const url = `https://wa.me/?text=${text}`;
    window.open(url, "_blank");
  };

  const handleSyncLocalOrders = async () => {
    try {
      const saved = localStorage.getItem("app_orders");
      if (saved && isFirebaseConfigured) {
        setIsSyncing(true);
        const parsed = JSON.parse(saved) as any[];

        // ONLY sync orders that don't have a firebaseKey to avoid duplicates
        const unsyncedOrders = parsed.filter((o: any) => !o.firebaseKey);

        // Deduplicate unsynced orders by id and sessionId before syncing to Firestore
        const uniqueUnsynced = Array.from(
          new Map(
            unsyncedOrders.map((o: any) => [`${o.id}-${o.sessionId}`, o]),
          ).values(),
        ) as any[];

        if (uniqueUnsynced.length === 0) {
          setIsSyncing(false);
          return;
        }

        const syncedOrders = [...parsed];
        let hasChanges = false;

        for (const order of uniqueUnsynced) {
          try {
            const docRef = await addDoc(collection(db, "orders"), {
              ...order,
              timestamp: serverTimestamp(),
            });

            // Update the order in our local array with the new firebaseKey
            const index = syncedOrders.findIndex(
              (o: any) => o.id === order.id && o.sessionId === order.sessionId,
            );
            if (index !== -1) {
              syncedOrders[index] = {
                ...syncedOrders[index],
                firebaseKey: docRef.id,
              };
              hasChanges = true;
            }
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, "orders");
          }
        }

        if (hasChanges) {
          localStorage.setItem("app_orders", JSON.stringify(syncedOrders));
          setOrders(
            syncedOrders.map((o: any) => ({
              ...o,
              timestamp: new Date(o.timestamp),
            })),
          );
        }
        showNotification("Berhasil sinkronisasi pesanan!");
      }
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (
      isFirebaseConfigured &&
      localStorage.getItem("app_orders") &&
      !isSyncing
    ) {
      handleSyncLocalOrders();
    }
  }, [isFirebaseConfigured]);

  // Icon mapping
  const IconMap: any = {
    Package,
    Soup,
    Egg,
    Flame,
    Leaf,
    Utensils,
    Box,
    Droplet,
    Sparkles,
    Coffee,
    Camera,
    Beef,
  };

  // Calculate daily sales from orders
  const dailyData = useMemo(() => {
    const now = new Date();
    const today = now.toDateString();
    const todayOrders = orders.filter(
      (o) => o.status !== "dibatalkan" && o.timestamp.toDateString() === today,
    );

    // Group by hour
    const hourlySales: { [key: number]: number } = {};
    todayOrders.forEach((order) => {
      const h = order.timestamp.getHours();
      hourlySales[h] = (hourlySales[h] || 0) + order.total;
    });

    // Show all 24 hours
    const hours = Array.from({ length: 24 }, (_, i) => i);
    return hours.map((h) => ({
      time: `${h.toString().padStart(2, "0")}:00`,
      sales: hourlySales[h] || 0,
      isCurrent: h === now.getHours(),
    }));
  }, [orders]);

  const handleShareEmail = (order: Order) => {
    if (!order.customerEmail) {
      showNotification("Email pelanggan tidak tersedia.");
      return;
    }
    const subject = encodeURIComponent(
      `Nota Pembelian Indomi Nite - #${order.id}`,
    );
    const body = encodeURIComponent(
      generateReceiptText(order).replace(/\*/g, ""),
    );
    const url = `mailto:${order.customerEmail}?subject=${subject}&body=${body}`;
    window.open(url, "_blank");
  };

  const handleGenerateKuesionerSummary = async () => {
    setIsGeneratingKuesionerSummary(true);
    try {
      const kuesionerData = feedbacks
        .filter((f) => f.type === "Kuesioner")
        .map((f) => {
          try {
            return JSON.parse(f.comment);
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);

      if (kuesionerData.length === 0) {
        showNotification("Belum ada data kuesioner");
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY tidak dikonfigurasi.");
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Berikut adalah hasil responden kuesioner dari pelanggan aplikasi Indomi Nite (format JSON):\n${JSON.stringify(kuesionerData, null, 2)}\n\nKeterangan field:\n- q1: Kemudahan menemukan menu\n- q2: Tampilan desain aplikasi\n- q3: Kejelasan informasi harga\n- q4: Kendala teknis (error/lag)\n- q5: Alur pemesanan\n- q6: Saran & Masukan\n\nTolong berikan rangkuman analisis yang profesional, membantu, dan tidak membosankan.\n\nSertakan:\n1. Sentimen umum pelanggan\n2. Aspek yang paling disukai / bagus\n3. Aspek yang perlu perbaikan\n\nATURAN PENTING:\n- Gunakan format Markdown standar yang rapi.\n- JANGAN gunakan tag HTML seperti <br>.\n- Berikan jarak baris yang cukup dengan baris kosong antar paragraf/list agar mudah dibaca.\n- Gunakan EMOJI yang relevan di setiap judul atau poin agar lebih asik (misal: 📊, 💡, ⭐, 🚀, dll).\n- Pastikan menyebutkan Q1, Q2, dst dengan huruf kapital atau langsung sebutkan deskripsi aspeknya.\n- Jangan terlalu kaku, langsung to the point.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      if (response.text) {
        setAiKuesionerSummary(response.text.replace(/<br\s*\/?>/gi, "\n"));
      }
    } catch (e) {
      console.error(e);
      showNotification("Gagal membuat rangkuman");
    } finally {
      setIsGeneratingKuesionerSummary(false);
    }
  };

  const handleDownloadReport = () => {
    const [year, month, day] = reportFilterDate.split("-").map(Number);
    const selectedDate = new Date(year, month - 1, day);
    const date = selectedDate.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    let csvContent = "Laporan Penjualan Indomi Nite\n";
    csvContent += `Tanggal Filter: ${date} (${reportFilterType})\n\n`;
    csvContent += "ID Pesanan,Pelanggan,Menu,Total,Waktu,Status\n";

    const validOrders = orders.filter((o) => o.status !== "dibatalkan");
    let filteredOrders = validOrders;

    if (reportFilterType === "hari") {
      filteredOrders = filteredOrders.filter(
        (o) => o.timestamp.toDateString() === selectedDate.toDateString(),
      );
    } else if (reportFilterType === "minggu") {
      const startOfWeek = new Date(selectedDate);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      filteredOrders = filteredOrders.filter(
        (o) => o.timestamp >= startOfWeek && o.timestamp <= endOfWeek,
      );
    } else if (reportFilterType === "bulan") {
      filteredOrders = filteredOrders.filter(
        (o) =>
          o.timestamp.getMonth() === selectedDate.getMonth() &&
          o.timestamp.getFullYear() === selectedDate.getFullYear(),
      );
    }

    if (reportFilterMenu !== "semua") {
      filteredOrders = filteredOrders.filter((o) => {
        if (o.isManual) return false;
        return (o.items || []).some(
          (i) =>
            i &&
            i.item &&
            i.item.name.toLowerCase() === reportFilterMenu.toLowerCase(),
        );
      });
    }

    filteredOrders.forEach((order) => {
      const items =
        order.items && Array.isArray(order.items)
          ? order.items
              .filter((i) => i && i.item)
              .map((i) => i.item.name)
              .join("; ")
          : "";
      const time = order.timestamp.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      });
      csvContent += `${order.id},${order.customerName},${items},${order.total},${time},${order.status}\n`;
    });

    csvContent += `\nTotal Pendapatan: Rp ${(filteredReportData.revenue || 0).toLocaleString()}\n`;
    csvContent += `Total Pesanan: ${filteredReportData.ordersCount}\n`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `Laporan_IndomiNite_${date.replace(/ /g, "_")}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteFeedback = async () => {
    if (!feedbackToDelete) return;
    try {
      if (
        feedbackToDelete.type === "Aplikasi" ||
        feedbackToDelete.type === "Kuesioner"
      ) {
        if (isFirebaseConfigured) {
          await deleteDoc(doc(db, "app_feedback", feedbackToDelete.id));
        }
        setFeedbacks((prev) =>
          prev.filter((f) => f.id !== feedbackToDelete.id),
        );
      } else if (feedbackToDelete.type === "Order") {
        if (isFirebaseConfigured) {
          const order = orders.find(
            (o) =>
              o.firebaseKey === feedbackToDelete.id ||
              String(o.id) === feedbackToDelete.id,
          );
          const docId = order?.firebaseKey || feedbackToDelete.id;
          await updateDoc(doc(db, "orders", docId), {
            rating: deleteField(),
            feedback: deleteField(),
          });
        }
        setOrders((prev) => {
          const updated = prev.map((o) =>
            o.firebaseKey === feedbackToDelete.id ||
            String(o.id) === feedbackToDelete.id
              ? { ...o, rating: undefined, feedback: undefined }
              : o,
          );
          localStorage.setItem("app_orders", JSON.stringify(updated));
          return updated;
        });
      }
      showNotification("Feedback berhasil dihapus");
    } catch (error) {
      console.error("Gagal menghapus feedback:", error);
      showNotification("Gagal menghapus feedback");
    } finally {
      setFeedbackToDelete(null);
    }
  };

  const uniqueMenuItems = useMemo(() => {
    return ALL_MENU_ITEMS.map((item) => item.name).sort();
  }, []);

  const monthlyData = useMemo(() => {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agu",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];
    const result = [];

    // Start from March 2026
    const startYear = 2026;
    const startMonth = 2; // March is index 2

    for (let i = 0; i < 10; i++) {
      // Mar to Dec
      const monthIdx = startMonth + i;
      const year = startYear;

      const monthSales = orders
        .filter(
          (o) =>
            o.status !== "dibatalkan" &&
            !o.isDeleted &&
            o.timestamp.getMonth() === monthIdx &&
            o.timestamp.getFullYear() === year,
        )
        .reduce((sum, order) => sum + order.total, 0);

      result.push({
        name: months[monthIdx],
        sales: monthSales,
      });
    }
    return result;
  }, [orders]);

  // Calculate total items sold
  const totalItemsSold = totalOrders;

  const lowStockItems = inventory.filter(
    (item) => item.stock <= (item.min || 0),
  );

  if (viewDetail) {
    return (
      <div className="flex flex-col h-full bg-[#F5F2EA] relative">
        {/* Header */}
        <div className="px-6 pt-4 pb-4 flex items-center justify-between">
          <button
            onClick={() => setViewDetail(false)}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#3D2B1F]/5 text-[#3D2B1F]"
          >
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-lg font-bold text-[#3D2B1F]">
            Detail Perhitungan Bahan
          </h2>
          <button className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#3D2B1F]/5 text-[#3D2B1F]">
            <div className="flex gap-1">
              <div className="h-1 w-1 bg-[#3D2B1F] rounded-full"></div>
              <div className="h-1 w-1 bg-[#3D2B1F] rounded-full"></div>
              <div className="h-1 w-1 bg-[#3D2B1F] rounded-full"></div>
            </div>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-24">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-[#3D2B1F]">
              Ringkasan Penggunaan
            </h3>
            <p className="text-xs text-[#3D2B1F]/40">
              Update terakhir: Hari ini, 18:30
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-white p-5 rounded-2xl border border-[#3D2B1F]/5 shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-[#3D2B1F]/60">
                <Trash2 size={14} />
                <span className="text-xs font-bold">Total Terpakai</span>
              </div>
              <p className="text-2xl font-bold text-[#3D2B1F] leading-none mb-1">
                {totalItemsSold}
              </p>
              <p className="text-lg font-bold text-[#3D2B1F] mb-2">Porsi</p>
              <p className="text-[10px] font-bold text-green-600 flex items-center gap-1">
                <TrendingUp size={10} /> Baru Mulai
              </p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-[#3D2B1F]/5 shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-[#3D2B1F]/60">
                <AlertTriangle size={14} />
                <span className="text-xs font-bold">Pendapatan Hari Ini</span>
              </div>
              <p className="text-2xl font-bold text-[#3D2B1F] leading-none mb-1">
                {(revenueToday / 1000).toFixed(0)}k
              </p>
              <p className="text-lg font-bold text-[#3D2B1F] mb-2">Rupiah</p>
              <p className="text-[10px] font-bold text-[#3D2B1F]/40 flex items-center gap-1">
                -
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#3D2B1F]">
              Daftar Bahan Baku
            </h3>
            <button className="text-xs font-bold text-[#D4AF37]">
              Lihat Semua
            </button>
          </div>

          <div className="space-y-4 mb-8">
            {inventory.map((item) => {
              const IconComponent = IconMap[item.icon] || Package;
              const isLowStock = item.stock <= (item.min || 0);
              return (
                <div
                  key={item.id}
                  className="bg-white p-4 rounded-2xl border border-[#3D2B1F]/5 shadow-sm flex items-center gap-4"
                >
                  <div
                    className={`h-16 w-16 rounded-xl overflow-hidden shrink-0 flex items-center justify-center ${item.color}`}
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl
                          .replace("github.com", "raw.githubusercontent.com")
                          .replace("/blob/", "/")}
                        alt={item.name}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <IconComponent size={32} />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-[#3D2B1F] text-sm">
                      {item.name}
                    </p>
                    <p className="text-xs text-[#3D2B1F]/40 mt-1">
                      Dibutuhkan: {item.max} {item.unit} | Stok: {item.stock}{" "}
                      {item.unit}
                    </p>
                    <div className="h-1.5 w-full bg-[#3D2B1F]/5 rounded-full mt-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isLowStock ? "bg-red-500" : item.stock < item.max * 0.5 ? "bg-orange-400" : "bg-green-500"}`}
                        style={{ width: `${(item.stock / item.max) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    {isLowStock ? (
                      <>
                        <div className="h-6 w-6 rounded-full bg-[#3D2B1F]/10 flex items-center justify-center text-[#3D2B1F] mb-1">
                          <Package size={14} />
                        </div>
                        <span className="text-[8px] font-bold text-[#3D2B1F] uppercase tracking-wider">
                          KRITIS
                        </span>
                      </>
                    ) : item.stock < item.max * 0.5 ? (
                      <>
                        <div className="h-6 w-6 rounded-full bg-[#3D2B1F]/10 flex items-center justify-center text-[#3D2B1F] mb-1">
                          <Package size={14} />
                        </div>
                        <span className="text-[8px] font-bold text-[#3D2B1F] uppercase tracking-wider">
                          MENIPIS
                        </span>
                      </>
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center text-green-500">
                        <CheckCircle size={14} fill="currentColor" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#F5F2EA] relative">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between bg-white shadow-sm z-10 relative">
        <button
          onClick={() => setIsMenuOpen(true)}
          className="text-[#3D2B1F] p-2 -ml-2 rounded-full hover:bg-[#3D2B1F]/5"
        >
          <div className="space-y-1">
            <div className="w-5 h-0.5 bg-[#3D2B1F]"></div>
            <div className="w-3 h-0.5 bg-[#3D2B1F]"></div>
            <div className="w-5 h-0.5 bg-[#3D2B1F]"></div>
          </div>
        </button>
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-[#3D2B1F]">Indomi Nite</h1>
            <div className="flex items-center gap-1 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
              <div className="h-1.5 w-1.5 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-[8px] font-bold text-red-500 uppercase tracking-widest">
                Live
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsNotificationsOpen(true)}
          className="h-9 w-9 bg-white rounded-full flex items-center justify-center shadow-sm border border-[#3D2B1F]/5 relative"
        >
          <Bell size={18} className="text-[#3D2B1F]" />
          {orders.filter(
            (o) => !o.isDeleted && !dismissedNotifs.includes(String(o.id)),
          ).length > 0 && (
            <div className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full"></div>
          )}
        </button>
      </div>

      <AnimatePresence>
        {isNotificationsOpen && (
          <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNotificationsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md bg-[#F5F2EA] rounded-t-[2rem] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 bg-white flex justify-between items-center border-b border-[#3D2B1F]/5">
                <h3 className="text-xl font-bold text-[#3D2B1F]">Notifikasi</h3>
                <button
                  onClick={() => setIsNotificationsOpen(false)}
                  className="h-8 w-8 bg-stone-100 rounded-full flex items-center justify-center text-[#3D2B1F]/60 hover:bg-stone-200"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                {/* Welcome Notification */}
                <div className="mb-4 p-4 bg-white rounded-2xl shadow-sm border border-[#3D2B1F]/5">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-orange-500 uppercase tracking-widest">
                      Sistem
                    </span>
                    <span className="text-[10px] text-[#3D2B1F]/40">
                      Baru saja
                    </span>
                  </div>
                  <p className="text-sm font-bold text-[#3D2B1F] mb-1">
                    Selamat datang di Dashboard Owner!
                  </p>
                  <p className="text-xs text-[#3D2B1F]/60">
                    Pantau pesanan masuk secara real-time di sini.
                  </p>
                </div>

                {orders
                  .filter(
                    (o) =>
                      !o.isDeleted && !dismissedNotifs.includes(String(o.id)),
                  )
                  .slice(0, 15)
                  .map((order) => {
                    const title = `Pesanan Baru #${order.orderNumber || String(order.id).slice(-4).toUpperCase()}`;
                    const message = `Pelanggan ${order.customerName} baru saja memesan ${order.items.length} item.`;

                    return (
                      <div
                        key={order.id}
                        className="mb-4 p-4 bg-white rounded-2xl shadow-sm border border-[#3D2B1F]/5 relative group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-[#3D2B1F]/60 uppercase tracking-widest">
                            {title}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[#3D2B1F]/40">
                              {order.timestamp instanceof Date
                                ? order.timestamp.toLocaleTimeString("id-ID", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Baru saja"}
                            </span>
                            <button
                              onClick={() => onDismissNotif(String(order.id))}
                              className="text-[#3D2B1F]/20 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-[#3D2B1F] mb-1 pr-6">
                          {message}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <div
                            className={`h-1.5 w-1.5 rounded-full ${order.status === "selesai" ? "bg-green-500" : "bg-orange-500 animate-pulse"}`}
                          ></div>
                          <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                            {order.status}
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingOrder && (
          <div
            key="edit-order-modal"
            className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingOrder(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#FAFAFA] w-full max-w-[500px] rounded-3xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 md:p-8 overflow-y-auto">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-[#3D2B1F]">
                    Edit Transaksi
                  </h3>
                </div>

                <div className="space-y-6">
                  {/* Top Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest block mb-1.5">
                        Nama Pelanggan
                      </label>
                      <input
                        type="text"
                        defaultValue={editingOrder.customerName}
                        onChange={(e) =>
                          setEditingOrder({
                            ...editingOrder,
                            customerName: e.target.value,
                          })
                        }
                        className="w-full bg-[#F3F1ED] border-none rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest block mb-1.5">
                        No. WhatsApp
                      </label>
                      <input
                        type="text"
                        defaultValue={editingOrder.customerPhone || ""}
                        onChange={(e) =>
                          setEditingOrder({
                            ...editingOrder,
                            customerPhone: e.target.value,
                          })
                        }
                        className="w-full bg-[#F3F1ED] border-none rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest block mb-1.5">
                        Tanggal & Waktu
                      </label>
                      <div className="relative">
                        <input
                          type="datetime-local"
                          value={
                            editingOrder.timestamp
                              ? new Date(
                                  editingOrder.timestamp.getTime() -
                                    editingOrder.timestamp.getTimezoneOffset() *
                                      60000,
                                )
                                  .toISOString()
                                  .slice(0, 16)
                              : ""
                          }
                          onChange={(e) => {
                            if (!e.target.value) return;
                            setEditingOrder({
                              ...editingOrder,
                              timestamp: new Date(e.target.value),
                            });
                          }}
                          className="w-full bg-[#F3F1ED] border-none rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest block mb-1.5">
                        Metode Bayar
                      </label>
                      <select
                        value={editingOrder.paymentMethod || "TUNAI"}
                        onChange={(e) =>
                          setEditingOrder({
                            ...editingOrder,
                            paymentMethod: e.target.value,
                          })
                        }
                        className="w-full bg-[#F3F1ED] border-none rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 appearance-none"
                      >
                        <option value="TUNAI">TUNAI</option>
                        <option value="QRIS">QRIS</option>
                        <option value="TRANSFER">TRANSFER</option>
                        <option value="GOPAY">GOPAY</option>
                        <option value="OVO">OVO</option>
                        <option value="SHOPEEPAY">SHOPEEPAY</option>
                      </select>
                    </div>
                  </div>

                  {/* Menu Section */}
                  <div className="bg-[#F3F1ED] p-4 md:p-5 rounded-2xl flex flex-col gap-4">
                    <div className="bg-white rounded-xl overflow-hidden flex flex-col">
                      {(editingOrder.items || []).map((cartItem, idx) => {
                        const uPrice =
                          cartItem.item.priceNum ||
                          parseInt(
                            cartItem.item.price
                              ?.toString()
                              .replace(/[^0-9]/g, "") || "0",
                          ) ||
                          0;
                        return (
                          <div
                            key={`edit-item-${idx}`}
                            className="flex flex-col px-4 py-4 border-b border-stone-100 last:border-b-0 gap-3"
                          >
                            <div className="pl-1">
                              <div className="flex justify-between items-center mb-1">
                                <label className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest block">
                                  Menu Utama
                                </label>
                                {editingOrder.items.length > 1 && (
                                  <button
                                    onClick={() => {
                                      const newItems =
                                        editingOrder.items.filter(
                                          (_, i) => i !== idx,
                                        );
                                      updateEditingOrderItems(newItems);
                                    }}
                                    className="text-red-500 bg-red-50 p-1 rounded"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                              <div className="flex gap-2 mb-3">
                                <select
                                  value={cartItem.item.name}
                                  onChange={(e) => {
                                    const newItems = [
                                      ...(editingOrder.items || []),
                                    ];
                                    const name = e.target.value;
                                    let price = 6000;
                                    if (name === "Indomie Rendang")
                                      price = 7000;
                                    if (name === "Telur Gulung") price = 1000;
                                    if (name === "Telur Gulung Sosis")
                                      price = 2000;
                                    newItems[idx] = {
                                      ...newItems[idx],
                                      item: {
                                        ...newItems[idx].item,
                                        name: name,
                                        priceNum: price,
                                        price: `Rp ${price.toLocaleString("id-ID")}`,
                                      },
                                      toppings: [],
                                      accumulatedToppings: [],
                                    };
                                    updateEditingOrderItems(newItems);
                                  }}
                                  className="flex-1 bg-[#F3F1ED] border-none rounded-xl px-3 py-2 text-sm font-bold text-[#3D2B1F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 appearance-none"
                                >
                                  <option value="Indomie Goreng">
                                    Indomie Goreng
                                  </option>
                                  <option value="Indomie Kuah Soto">
                                    Indomie Kuah Soto
                                  </option>
                                  <option value="Indomie Rendang">
                                    Indomie Rendang
                                  </option>
                                  <option value="Telur Gulung">
                                    Telur Gulung
                                  </option>
                                  <option value="Telur Gulung Sosis">
                                    Telur Gulung Sosis
                                  </option>
                                </select>
                                <input
                                  type="number"
                                  value={cartItem.quantity}
                                  onChange={(e) => {
                                    const newItems = [
                                      ...(editingOrder.items || []),
                                    ];
                                    newItems[idx] = {
                                      ...newItems[idx],
                                      quantity: parseInt(e.target.value) || 1,
                                    };
                                    updateEditingOrderItems(newItems);
                                  }}
                                  className="w-16 bg-[#F3F1ED] border-none rounded-xl px-2 py-2 text-sm font-bold text-[#3D2B1F] text-center focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                                />
                              </div>

                              <label className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest block mb-1">
                                Add-on
                              </label>
                              <div className="flex gap-2 mb-2">
                                <select
                                  id={`addon-select-${idx}`}
                                  className="flex-1 bg-[#F3F1ED] border-none rounded-xl px-3 py-2 text-xs font-bold text-[#3D2B1F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 appearance-none"
                                  defaultValue=""
                                >
                                  <option value="" disabled>
                                    Pilih Add-on...
                                  </option>
                                  {getToppingsForItem(cartItem.item.name).map(
                                    (topping) => (
                                      <option
                                        key={topping.name}
                                        value={topping.name}
                                      >
                                        {topping.name}{" "}
                                        {topping.defaultPrice > 0
                                          ? `(+Rp ${topping.defaultPrice.toLocaleString("id-ID")})`
                                          : ""}
                                      </option>
                                    ),
                                  )}
                                </select>
                                <input
                                  type="number"
                                  id={`addon-qty-${idx}`}
                                  defaultValue={1}
                                  min={1}
                                  className="w-16 bg-[#F3F1ED] border-none rounded-xl px-2 py-2 text-xs font-bold text-[#3D2B1F] text-center focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const sel = document.getElementById(
                                      `addon-select-${idx}`,
                                    ) as HTMLSelectElement;
                                    const qty = document.getElementById(
                                      `addon-qty-${idx}`,
                                    ) as HTMLInputElement;
                                    const toppingName = sel?.value;
                                    const quantity = parseInt(qty?.value) || 1;
                                    if (!toppingName) return;

                                    const newItems = [
                                      ...(editingOrder.items || []),
                                    ];
                                    const currentToppings =
                                      cartItem.toppings ||
                                      cartItem.accumulatedToppings ||
                                      [];
                                    const addedToppings =
                                      Array(quantity).fill(toppingName);
                                    const updatedToppings = [
                                      ...currentToppings,
                                      ...addedToppings,
                                    ];
                                    newItems[idx] = {
                                      ...newItems[idx],
                                      toppings: updatedToppings,
                                      accumulatedToppings: updatedToppings,
                                    };
                                    updateEditingOrderItems(newItems);

                                    if (sel) sel.value = "";
                                    if (qty) qty.value = "1";
                                  }}
                                  className="bg-[#3D2B1F] text-white px-3 rounded-xl font-bold hover:bg-black transition-colors flex items-center justify-center"
                                >
                                  <Plus size={14} />
                                </button>
                              </div>

                              {(() => {
                                const currentToppings =
                                  cartItem.toppings ||
                                  cartItem.accumulatedToppings ||
                                  [];
                                if (currentToppings.length === 0) return null;
                                return (
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    {currentToppings.map((t, tIdx) => {
                                      return (
                                        <div
                                          key={tIdx}
                                          className="bg-[#3D2B1F] text-white px-2 py-1 flex items-center gap-1.5 rounded-lg text-[10px] font-bold"
                                        >
                                          <span>{t}</span>
                                          <button
                                            onClick={() => {
                                              const newItems = [
                                                ...(editingOrder.items || []),
                                              ];
                                              const updatedToppings =
                                                currentToppings.filter(
                                                  (_, i) => i !== tIdx,
                                                );
                                              newItems[idx] = {
                                                ...newItems[idx],
                                                toppings: updatedToppings,
                                                accumulatedToppings:
                                                  updatedToppings,
                                              };
                                              updateEditingOrderItems(newItems);
                                            }}
                                            className="text-white/60 hover:text-white"
                                          >
                                            <X size={10} />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-dashed border-stone-200">
                              <span className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                                Total Pembayaran
                              </span>
                              <span className="font-bold text-sm text-[#D4AF37]">
                                Rp{" "}
                                {(() => {
                                  const currentToppings =
                                    cartItem.toppings ||
                                    cartItem.accumulatedToppings ||
                                    [];
                                  const toppingsTotal = currentToppings.reduce(
                                    (sum, t) => {
                                      const tInfo = getToppingsForItem(
                                        cartItem.item.name,
                                      ).find((x) => x.name === t);
                                      return (
                                        sum + (tInfo ? tInfo.defaultPrice : 0)
                                      );
                                    },
                                    0,
                                  );
                                  return (
                                    uPrice * cartItem.quantity +
                                    toppingsTotal
                                  ).toLocaleString("id-ID");
                                })()}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newItems = [
                          ...(editingOrder.items || []),
                          {
                            id: Date.now().toString(),
                            item: {
                              id: Date.now(),
                              name: "Indomie Goreng",
                              price: 6000,
                              priceNum: 6000,
                              isAddOn: false,
                              category: "Baru",
                              img: "",
                            },
                            quantity: 1,
                            toppings: [],
                            totalPrice: 6000,
                          },
                        ];
                        updateEditingOrderItems(newItems);
                      }}
                      className="w-full bg-[#3D2B1F]/10 text-[#3D2B1F] py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#3D2B1F]/20 transition-colors"
                    >
                      <Plus size={16} /> Tambah Item Lain
                    </button>

                    <div className="mt-4">
                      <label className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest block mb-1.5">
                        Catatan
                      </label>
                      <textarea
                        value={editingOrder.notes || ""}
                        onChange={(e) =>
                          setEditingOrder({
                            ...editingOrder,
                            notes: e.target.value,
                          })
                        }
                        className="w-full bg-white border-none rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 placeholder-[#3D2B1F]/20 resize-none h-20"
                        placeholder="Tambahkan catatan khusus..."
                      />
                    </div>
                  </div>

                  {/* Status Section */}
                  <div>
                    <label className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest block mb-2">
                      Status Pesanan
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        "diterima",
                        "dimasak",
                        "diantar",
                        "selesai",
                        "dibatalkan",
                      ].map((status) => (
                        <button
                          key={status}
                          onClick={() =>
                            setEditingOrder({
                              ...editingOrder,
                              status: status as any,
                            })
                          }
                          className={`py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                            editingOrder.status === status
                              ? "bg-[#3D2B1F] text-white"
                              : "bg-[#F3F1ED] text-[#3D2B1F]/60 hover:bg-stone-200"
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bottom Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest block mb-1.5">
                        Total (Rp)
                      </label>
                      <input
                        type="number"
                        value={editingOrder.total || 0}
                        onChange={(e) =>
                          setEditingOrder({
                            ...editingOrder,
                            total: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-[#F3F1ED] border-none rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest block mb-1.5">
                        Profit (Rp)
                      </label>
                      <input
                        type="number"
                        value={editingOrder.manualProfit || 0}
                        onChange={(e) =>
                          setEditingOrder({
                            ...editingOrder,
                            manualProfit: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-[#F3F1ED] border-none rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex gap-4 sticky bottom-0 bg-[#FAFAFA] z-10 pb-2">
                    <button
                      onClick={() => setEditingOrder(null)}
                      className="flex-[0.4] py-4 rounded-xl text-sm font-bold text-[#3D2B1F]/60 hover:text-[#3D2B1F] transition-all"
                    >
                      Batal
                    </button>
                    <button
                      onClick={() => {
                        onEditOrder(editingOrder.id, {
                          customerName: editingOrder.customerName,
                          customerPhone: editingOrder.customerPhone,
                          customerAddress: editingOrder.customerAddress,
                          paymentMethod: editingOrder.paymentMethod,
                          status: editingOrder.status,
                          items: editingOrder.items,
                          total: editingOrder.total,
                          notes: editingOrder.notes || "",
                          manualProfit: editingOrder.manualProfit,
                          timestamp: editingOrder.timestamp,
                        });
                        setEditingOrder(null);
                      }}
                      className="flex-[0.6] py-4 rounded-xl text-sm font-bold text-white bg-[#3D2B1F] shadow-lg hover:bg-black transition-all active:scale-95"
                    >
                      Simpan Perubahan
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="absolute inset-0 bg-black/50 z-40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute top-0 left-0 bottom-0 w-64 bg-[#F5F2EA] z-50 shadow-2xl p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-sans font-bold text-[#3D2B1F]">
                  Menu
                </h2>
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="h-8 w-8 rounded-full bg-white flex items-center justify-center text-[#3D2B1F] shadow-sm"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-2 flex-1">
                {[
                  { id: "beranda", label: "Beranda", icon: Home },
                  { id: "laporan", label: "Laporan", icon: BarChart3 },
                  { id: "stok", label: "Stok", icon: Package },
                  { id: "rating", label: "Rating", icon: Star },
                  { id: "sampah", label: "Tempat Sampah", icon: Trash2 },
                  { id: "pengaturan", label: "Profile", icon: User },
                ].map((menu) => (
                  <button
                    key={menu.id}
                    onClick={() => {
                      setActiveTab(menu.id as any);
                      setIsMenuOpen(false);
                    }}
                    className={`w-full p-4 rounded-xl flex items-center gap-4 transition-all ${activeTab === menu.id ? "bg-[#3D2B1F] text-white shadow-lg" : "text-[#3D2B1F] hover:bg-[#3D2B1F]/5"}`}
                  >
                    <menu.icon size={20} />
                    <span className="font-bold text-sm">{menu.label}</span>
                  </button>
                ))}

                {/* Switch to Customer Mode Button */}
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onSwitchToCustomer();
                  }}
                  className="w-full p-4 rounded-xl flex items-center gap-4 transition-all text-[#3D2B1F] hover:bg-[#3D2B1F]/5 mt-4 border-t border-[#3D2B1F]/10"
                >
                  <Utensils size={20} />
                  <span className="font-bold text-sm">Mode Pelanggan</span>
                </button>
              </div>

              <div className="pt-6 border-t border-[#3D2B1F]/10">
                <button
                  onClick={onLogout}
                  className="w-full p-4 rounded-xl bg-red-50 text-red-600 font-bold flex items-center gap-4 hover:bg-red-100 transition-colors"
                >
                  <LogOut size={20} />
                  <span className="text-sm">Keluar</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <input
        type="file"
        accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.xlsm"
        className="hidden"
        ref={imageInputRef}
        onChange={handleFileUpload}
      />
      <input
        type="file"
        accept=".csv, image/*, application/pdf, .xlsx, .xls, .doc, .docx"
        className="hidden"
        ref={csvInputRef}
        onChange={handleCsvImport}
      />

      <div className="flex-1 overflow-y-auto px-6 pb-24 pt-6">
        {activeTab === "beranda" && (
          <>
            {/* Quick Stats Today */}
            <div className="mb-8 grid grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-[#3D2B1F]/5 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-1">
                    Total Pesanan Aktif
                  </p>
                  <p className="text-3xl font-bold text-[#3D2B1F]">
                    {
                      orders.filter(
                        (o) =>
                          o.status !== "selesai" &&
                          o.status !== "dibatalkan" &&
                          !o.isDeleted,
                      ).length
                    }
                  </p>
                </div>
                <div className="h-10 w-10 mt-4 rounded-xl bg-[#3D2B1F]/5 flex items-center justify-center text-[#3D2B1F]">
                  <ShoppingBag size={20} />
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-[#3D2B1F]/5 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-1">
                    Total Pesanan Hari Ini
                  </p>
                  <p className="text-3xl font-bold text-[#3D2B1F]">
                    {
                      orders.filter((o) => {
                        const today = new Date().toDateString();
                        return (
                          new Date(o.timestamp).toDateString() === today &&
                          !o.isDeleted
                        );
                      }).length
                    }
                  </p>
                </div>
                <div className="h-10 w-10 mt-4 rounded-xl bg-[#3D2B1F]/5 flex items-center justify-center text-[#3D2B1F]">
                  <Calendar size={20} />
                </div>
              </div>
            </div>

            {/* Active Orders Section */}
            {orders.filter(
              (o) =>
                o.status !== "selesai" &&
                o.status !== "dibatalkan" &&
                !o.isDeleted,
            ).length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-[#3D2B1F]">
                    Pesanan Masuk (Aktif)
                  </h3>
                  <span className="bg-orange-100 text-orange-600 text-[10px] font-bold px-3 py-1 rounded-full">
                    {
                      orders.filter(
                        (o) =>
                          o.status !== "selesai" &&
                          o.status !== "dibatalkan" &&
                          !o.isDeleted,
                      ).length
                    }{" "}
                    Pesanan
                  </span>
                </div>
                <div className="space-y-3">
                  {orders
                    .filter(
                      (o) =>
                        o.status !== "selesai" &&
                        o.status !== "dibatalkan" &&
                        !o.isDeleted,
                    )
                    .sort((a, b) => {
                      const timeA =
                        a.timestamp instanceof Date
                          ? a.timestamp
                          : new Date(a.timestamp);
                      const timeB =
                        b.timestamp instanceof Date
                          ? b.timestamp
                          : new Date(b.timestamp);
                      const timeDiff = timeA.getTime() - timeB.getTime();
                      if (timeDiff !== 0) return timeDiff;
                      const aId = a.firebaseKey || a.id || "";
                      const bId = b.firebaseKey || b.id || "";
                      return aId.localeCompare(bId);
                    })
                    .map((order, idx) => (
                      <div
                        key={
                          order.firebaseKey ||
                          `${order.id}-${order.sessionId || idx}`
                        }
                        className="bg-white p-6 rounded-[2rem] border border-[#3D2B1F]/5 shadow-sm flex flex-col gap-4 min-h-[250px]"
                      >
                        <div className="flex justify-center items-center relative border-b border-[#3D2B1F]/5 pb-3">
                          <div className="text-center">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                              NOTA PESANAN
                            </p>
                            <p className="text-lg font-bold text-[#3D2B1F]">
                              #{getSequentialOrderNumber(order, orders)}
                            </p>
                          </div>
                          <div className="absolute right-0 flex gap-1">
                            <button
                              onClick={() => setEditingOrder(order)}
                              className="h-8 w-8 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center hover:bg-stone-200 transition-colors"
                              title="Edit Pesanan"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setOrderToDelete(order.id)}
                              className="h-8 w-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 transition-colors"
                              title="Hapus Pesanan"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-start justify-between border-b border-[#3D2B1F]/5 pb-3">
                          <div className="text-left">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                              INFO PELANGGAN
                            </p>
                            <p className="font-bold text-[#3D2B1F] text-lg mt-0.5">
                              {order.customerName || "Pelanggan"}
                            </p>
                            {order.customerPhone && (
                              <p className="font-bold text-[#3D2B1F]/80 text-sm mt-0.5 flex items-center gap-1">
                                <Phone size={12} /> {order.customerPhone}
                              </p>
                            )}
                            {order.customerAddress && (
                              <p className="text-xs text-[#3D2B1F]/60 mt-1 flex items-start gap-1">
                                <MapPin
                                  size={10}
                                  className="mt-0.5 min-w-[10px]"
                                />{" "}
                                <span className="line-clamp-2">
                                  {order.customerAddress}
                                </span>
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end justify-center">
                            <span
                              className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                                order.status === "diterima"
                                  ? "bg-red-50 text-red-600"
                                  : order.status === "dimasak"
                                    ? "bg-orange-50 text-orange-600"
                                    : order.status === "dibatalkan"
                                      ? "bg-rose-100 text-rose-700 border border-rose-200"
                                      : "bg-purple-50 text-purple-600"
                              }`}
                            >
                              {order.status}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-2">
                              MENU PESANAN
                            </p>
                            {(() => {
                              const grouped = getGroupedItems(order.items);
                              const mains: any[] = [];
                              const addonsMap: Record<string, number> = {};

                              grouped.forEach((gi) => {
                                const nameLower = gi.item.name.toLowerCase();
                                const isToppingName =
                                  ["telur", "sosis", "sayur", "cabe"].some(
                                    (t) => nameLower === t,
                                  ) ||
                                  nameLower.includes("+rp") ||
                                  nameLower.includes("+ rp");
                                const isMenuTambahan =
                                  nameLower === "menu tambahan";

                                if (!isToppingName && !isMenuTambahan) {
                                  mains.push(gi);
                                } else if (isToppingName || isMenuTambahan) {
                                  if (isToppingName) {
                                    addonsMap[gi.item.name] =
                                      (addonsMap[gi.item.name] || 0) +
                                      gi.quantity;
                                  }
                                }
                                const toppingsSource =
                                  gi.accumulatedToppings || gi.toppings;
                                if (
                                  toppingsSource &&
                                  toppingsSource.length > 0
                                ) {
                                  toppingsSource.forEach((t) => {
                                    addonsMap[t] = (addonsMap[t] || 0) + 1;
                                  });
                                }
                              });

                              return (
                                <>
                                  {mains.map((item, idx) => {
                                    const uPrice =
                                      item.item.priceNum ||
                                      parseInt(
                                        item.item.price
                                          ?.toString()
                                          .replace(/[^0-9]/g, "") || "0",
                                      ) ||
                                      0;
                                    return (
                                      <div key={`main-${idx}`} className="mb-2">
                                        <div className="flex justify-between items-start">
                                          <p className="text-sm font-bold text-[#3D2B1F]">
                                            {item.item.name.toLowerCase()} -{" "}
                                            {item.quantity}
                                          </p>
                                          <span className="text-sm font-bold text-[#3D2B1F]">
                                            Rp{" "}
                                            {(
                                              uPrice * item.quantity
                                            ).toLocaleString("id-ID")}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  <div className="border-t border-dashed border-[#3D2B1F]/20 my-2"></div>

                                  {Object.keys(addonsMap).length > 0 && (
                                    <div className="mb-2">
                                      <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-1.5">
                                        ADD ON :
                                      </p>
                                      <div className="space-y-1">
                                        {Object.entries(addonsMap).map(
                                          ([name, count]) => {
                                            const tPrice =
                                              getToppingPrice(name);
                                            const cleanName = name
                                              .split("+")[0]
                                              .split("Rp")[0]
                                              .trim()
                                              .toLowerCase();
                                            const isSaus =
                                              cleanName.includes("saus") ||
                                              cleanName.includes("sambal") ||
                                              cleanName.includes("tomat");
                                            return (
                                              <div
                                                key={name}
                                                className="flex justify-between items-center text-sm font-bold text-[#3D2B1F]"
                                              >
                                                <span>
                                                  {isSaus
                                                    ? cleanName
                                                    : `${cleanName} - ${count}`}
                                                </span>
                                                <span>
                                                  Rp{" "}
                                                  {(
                                                    tPrice * count
                                                  ).toLocaleString("id-ID")}
                                                </span>
                                              </div>
                                            );
                                          },
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                            <div className="border-t border-dashed border-[#3D2B1F]/20 my-2"></div>
                          </div>
                        </div>

                        <div className="space-y-3 pt-1">
                          <div className="flex justify-between items-center uppercase">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 tracking-widest">
                              TOTAL PEMBAYARAN
                            </p>
                            <p className="text-sm font-bold text-[#3D2B1F]">
                              Rp {(order.total || 0).toLocaleString()}
                            </p>
                          </div>
                          {order.items &&
                            Array.isArray(order.items) &&
                            order.items.some((i) => i.notes) && (
                              <div className="pt-1">
                                <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-0.5">
                                  CATATAN PESANAN
                                </p>
                                {order.items
                                  .filter((i) => i.notes)
                                  .map((item, nIdx) => (
                                    <p
                                      key={nIdx}
                                      className="text-[11px] text-[#3D2B1F]/60 italic"
                                    >
                                      - {item.item.name}: {item.notes}
                                    </p>
                                  ))}
                              </div>
                            )}

                          {order.notes && (
                            <div className="bg-orange-50/50 p-3 rounded-xl border border-orange-100/50 my-1">
                              <p className="text-[9px] font-bold text-orange-700 uppercase tracking-widest mb-1 font-black">
                                CATATAN TRANSAKSI (KHUSUS)
                              </p>
                              <p className="text-[11px] font-bold text-[#3D2B1F]/80">
                                {order.notes}
                              </p>
                            </div>
                          )}

                          <div className="flex justify-between items-center">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                              METODE PEMBAYARAN
                            </p>
                            <p className="text-sm font-bold text-[#3D2B1F]">
                              {order.paymentMethod || "TUNAI"}
                            </p>
                          </div>
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                              JAM PEMESANAN
                            </p>
                            <p className="text-sm font-bold text-[#3D2B1F]">
                              {order.timestamp.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                          {order.appRating && (
                            <div className="pt-2">
                              <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-0.5">
                                RATING PELANGGAN (APLIKASI)
                              </p>
                              <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    size={12}
                                    className={`${
                                      star <= order.appRating!
                                        ? "fill-[#FBBF24] text-[#FBBF24]"
                                        : "text-gray-300"
                                    }`}
                                  />
                                ))}
                              </div>
                              {order.appFeedback && (
                                <p className="text-[11px] text-[#3D2B1F]/60 italic mt-1">
                                  "{order.appFeedback}"
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {order.status !== "dibatalkan" && (
                          <div className="flex gap-2 pt-4 border-t border-[#3D2B1F]/5">
                            {cancelingOrderId === (order.firebaseKey || order.id) ? (
                              <div className="flex-1 flex gap-1.5">
                                <button
                                  onClick={async () => {
                                    setUpdatingOrderId(order.firebaseKey || order.id);
                                    setCancelingOrderId(null);
                                    try {
                                      await onUpdateOrderStatus(
                                        order.firebaseKey || order.id,
                                        "dibatalkan",
                                      );
                                    } catch (err) {
                                      console.error("Failed to cancel order:", err);
                                    } finally {
                                      setUpdatingOrderId(null);
                                    }
                                  }}
                                  disabled={updatingOrderId === (order.firebaseKey || order.id)}
                                  className="flex-1 bg-red-600 text-white text-xs font-black py-3.5 rounded-xl hover:bg-red-700 transition-all active:scale-95 shadow-md flex items-center justify-center gap-1"
                                >
                                  {updatingOrderId === (order.firebaseKey || order.id) ? "Memproses..." : "Ya, Batalkan!"}
                                </button>
                                <button
                                  onClick={() => setCancelingOrderId(null)}
                                  className="px-3 bg-gray-100 text-[#3D2B1F] text-xs font-bold py-3.5 rounded-xl hover:bg-gray-200 transition-all active:scale-95"
                                >
                                  Tunda
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setCancelingOrderId(order.firebaseKey || order.id)}
                                disabled={updatingOrderId === (order.firebaseKey || order.id)}
                                className={`flex-1 bg-red-50 border border-red-200 text-red-600 text-xs font-bold py-3.5 rounded-xl hover:bg-red-100 transition-all active:scale-95 ${updatingOrderId === (order.firebaseKey || order.id) ? "opacity-30 cursor-not-allowed" : ""}`}
                              >
                                {updatingOrderId === (order.firebaseKey || order.id) ? "Memproses..." : "Batalkan"}
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                setUpdatingOrderId(order.firebaseKey || order.id);
                                try {
                                  await onUpdateOrderStatus(
                                    order.firebaseKey || order.id,
                                    "selesai",
                                  );
                                } catch (err) {
                                  console.error(
                                    "Failed to update order status:",
                                    err,
                                  );
                                } finally {
                                  setUpdatingOrderId(null);
                                }
                              }}
                              disabled={
                                updatingOrderId ===
                                (order.firebaseKey || order.id)
                              }
                              className={`flex-[1.5] bg-[#3D2B1F] text-white text-xs font-bold py-3.5 rounded-xl shadow-lg hover:bg-black transition-all active:scale-95 ${updatingOrderId === (order.firebaseKey || order.id) ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              {updatingOrderId === (order.firebaseKey || order.id)
                                ? "Memproses..."
                                : "Selesaikan Pesanan"}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Pesanan Selesai Hari Ini */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="font-bold text-[#3D2B1F]">
                  Pesanan Selesai Hari Ini
                </h3>
                <span className="bg-green-100 text-green-600 text-[10px] font-bold px-3 py-1 rounded-full">
                  {
                    orders.filter(
                      (o) =>
                        o.status === "selesai" &&
                        o.timestamp.toDateString() ===
                          new Date().toDateString() &&
                        !o.isDeleted,
                    ).length
                  }{" "}
                  Selesai
                </span>
              </div>

              <div className="space-y-4">
                {orders.filter(
                  (o) =>
                    o.status === "selesai" &&
                    o.timestamp.toDateString() === new Date().toDateString() &&
                    !o.isDeleted,
                ).length === 0 ? (
                  <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-[#3D2B1F]/5 flex flex-col items-center justify-center text-center">
                    <div className="h-16 w-16 rounded-full bg-[#3D2B1F]/5 flex items-center justify-center text-[#3D2B1F]/20 mb-3">
                      <CheckCircle size={32} />
                    </div>
                    <p className="text-sm text-[#3D2B1F]/40">
                      Belum ada pesanan selesai hari ini.
                    </p>
                  </div>
                ) : (
                  orders
                    .filter(
                      (o) =>
                        o.status === "selesai" &&
                        o.timestamp.toDateString() ===
                          new Date().toDateString() &&
                        !o.isDeleted,
                    )
                    .sort((a, b) => {
                      const timeA =
                        a.timestamp instanceof Date
                          ? a.timestamp
                          : new Date(a.timestamp);
                      const timeB =
                        b.timestamp instanceof Date
                          ? b.timestamp
                          : new Date(b.timestamp);
                      const timeDiff = timeA.getTime() - timeB.getTime();
                      if (timeDiff !== 0) return timeDiff;
                      const aId = a.firebaseKey || a.id || "";
                      const bId = b.firebaseKey || b.id || "";
                      return aId.localeCompare(bId);
                    })
                    .map((order, idx) => (
                      <div
                        key={
                          order.firebaseKey ||
                          `${order.id}-${order.sessionId || idx}`
                        }
                        className="bg-white p-6 rounded-[2rem] shadow-sm border border-[#3D2B1F]/5 flex flex-col gap-4"
                      >
                        <div className="flex justify-center items-center relative border-b border-[#3D2B1F]/5 pb-3">
                          <div className="text-center">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                              NOTA PESANAN
                            </p>
                            <p className="text-lg font-bold text-[#3D2B1F]">
                              #{getSequentialOrderNumber(order, orders)}
                            </p>
                          </div>
                          <div className="absolute right-0 flex gap-1">
                            <button
                              onClick={() => openEditSalesOrderModal(order)}
                              className="h-8 w-8 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center hover:bg-stone-200 transition-colors"
                              title="Detail & Batalkan"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setOrderToDelete(order.id)}
                              className="h-8 w-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 transition-colors"
                              title="Hapus Pesanan"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-start justify-between border-b border-[#3D2B1F]/5 pb-3">
                          <div className="text-left">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                              INFO PELANGGAN
                            </p>
                            <p className="font-bold text-[#3D2B1F] text-lg">
                              {order.customerName}
                            </p>
                            {order.customerPhone && (
                              <p className="text-xs text-[#3D2B1F]/60 mt-0.5 flex items-center gap-1">
                                <Phone size={10} /> {order.customerPhone}
                              </p>
                            )}
                            {order.customerAddress && (
                              <p className="text-xs text-[#3D2B1F]/60 mt-1 flex items-start gap-1">
                                <MapPin
                                  size={10}
                                  className="mt-0.5 min-w-[10px]"
                                />{" "}
                                <span className="line-clamp-2">
                                  {order.customerAddress}
                                </span>
                              </p>
                            )}
                          </div>
                          <div className="text-right flex flex-col items-end justify-center">
                            <div className="flex items-center justify-end gap-1.5 text-green-600 bg-green-50 px-3 py-1 rounded-full">
                              <div className="h-1.5 w-1.5 rounded-full bg-green-500"></div>
                              <span className="text-[10px] font-bold uppercase tracking-wider">
                                Selesai
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-2">
                              MENU PESANAN
                            </p>
                            {(() => {
                              const grouped = getGroupedItems(order.items);
                              const mains: any[] = [];
                              const addonsMap: Record<string, number> = {};

                              grouped.forEach((gi) => {
                                const nameLower = gi.item.name.toLowerCase();
                                const isToppingName =
                                  ["telur", "sosis", "sayur", "cabe"].some(
                                    (t) => nameLower === t,
                                  ) ||
                                  nameLower.includes("+rp") ||
                                  nameLower.includes("+ rp");
                                const isMenuTambahan =
                                  nameLower === "menu tambahan";

                                if (!isToppingName && !isMenuTambahan) {
                                  mains.push(gi);
                                } else if (isToppingName || isMenuTambahan) {
                                  if (isToppingName) {
                                    addonsMap[gi.item.name] =
                                      (addonsMap[gi.item.name] || 0) +
                                      gi.quantity;
                                  }
                                }
                                const toppingsSource =
                                  gi.accumulatedToppings || gi.toppings;
                                if (
                                  toppingsSource &&
                                  toppingsSource.length > 0
                                ) {
                                  toppingsSource.forEach((t) => {
                                    addonsMap[t] = (addonsMap[t] || 0) + 1;
                                  });
                                }
                              });

                              return (
                                <>
                                  {mains.map((item, idx) => {
                                    const uPrice =
                                      item.item.priceNum ||
                                      parseInt(
                                        item.item.price
                                          ?.toString()
                                          .replace(/[^0-9]/g, "") || "0",
                                      ) ||
                                      0;
                                    return (
                                      <div key={`main-${idx}`} className="mb-2">
                                        <div className="flex justify-between items-start">
                                          <p className="text-sm font-bold text-[#3D2B1F]">
                                            {item.item.name.toLowerCase()} -{" "}
                                            {item.quantity}
                                          </p>
                                          <span className="text-sm font-bold text-[#3D2B1F]">
                                            Rp{" "}
                                            {(
                                              uPrice * item.quantity
                                            ).toLocaleString("id-ID")}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  <div className="border-t border-dashed border-[#3D2B1F]/20 my-2"></div>

                                  {Object.keys(addonsMap).length > 0 && (
                                    <div className="mb-2">
                                      <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-1.5">
                                        ADD ON :
                                      </p>
                                      <div className="space-y-1">
                                        {Object.entries(addonsMap).map(
                                          ([name, count]) => {
                                            const tPrice =
                                              getToppingPrice(name);
                                            const cleanName = name
                                              .split("+")[0]
                                              .split("Rp")[0]
                                              .trim()
                                              .toLowerCase();
                                            const isSaus =
                                              cleanName.includes("saus") ||
                                              cleanName.includes("sambal") ||
                                              cleanName.includes("tomat");
                                            return (
                                              <div
                                                key={name}
                                                className="flex justify-between items-center text-sm font-bold text-[#3D2B1F]"
                                              >
                                                <span>
                                                  {isSaus
                                                    ? cleanName
                                                    : `${cleanName} - ${count}`}
                                                </span>
                                                <span>
                                                  Rp{" "}
                                                  {(
                                                    tPrice * count
                                                  ).toLocaleString("id-ID")}
                                                </span>
                                              </div>
                                            );
                                          },
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                            <div className="border-t border-dashed border-[#3D2B1F]/20 my-2"></div>
                          </div>
                        </div>

                        <div className="space-y-3 pt-1">
                          <div className="flex justify-between items-center uppercase">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 tracking-widest">
                              TOTAL PEMBAYARAN
                            </p>
                            <p className="text-sm font-bold text-[#3D2B1F]">
                              Rp {(order.total || 0).toLocaleString()}
                            </p>
                          </div>
                          {order.items &&
                            Array.isArray(order.items) &&
                            order.items.some((i) => i.notes) && (
                              <div className="pt-1">
                                <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-0.5">
                                  CATATAN PESANAN
                                </p>
                                {order.items
                                  .filter((i) => i.notes)
                                  .map((item, nIdx) => (
                                    <p
                                      key={nIdx}
                                      className="text-[11px] text-[#3D2B1F]/60 italic"
                                    >
                                      - {item.item.name}: {item.notes}
                                    </p>
                                  ))}
                              </div>
                            )}

                          {order.notes && (
                            <div className="bg-orange-50/50 p-3 rounded-xl border border-orange-100/50 my-1">
                              <p className="text-[9px] font-bold text-orange-700 uppercase tracking-widest mb-1 font-black">
                                CATATAN TRANSAKSI (KHUSUS)
                              </p>
                              <p className="text-[11px] font-bold text-[#3D2B1F]/80">
                                {order.notes}
                              </p>
                            </div>
                          )}

                          <div className="flex justify-between items-center">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                              METODE PEMBAYARAN
                            </p>
                            <p className="text-sm font-bold text-[#3D2B1F]">
                              {order.paymentMethod || "TUNAI"}
                            </p>
                          </div>
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                              JAM PEMESANAN
                            </p>
                            <p className="text-sm font-bold text-[#3D2B1F]">
                              {order.timestamp.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                          {order.appRating && (
                            <div className="pt-2">
                              <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-0.5">
                                RATING PELANGGAN (APLIKASI)
                              </p>
                              <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    size={12}
                                    className={`${
                                      star <= order.appRating!
                                        ? "fill-[#FBBF24] text-[#FBBF24]"
                                        : "text-gray-300"
                                    }`}
                                  />
                                ))}
                              </div>
                              {order.appFeedback && (
                                <p className="text-[11px] text-[#3D2B1F]/60 italic mt-1">
                                  "{order.appFeedback}"
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Pesanan Dibatalkan Hari Ini */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="font-bold text-[#3D2B1F]">
                  Pesanan Dibatalkan Hari Ini
                </h3>
                <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold px-3 py-1 rounded-full">
                  {
                    orders.filter(
                      (o) =>
                        o.status === "dibatalkan" &&
                        o.timestamp.toDateString() ===
                          new Date().toDateString() &&
                        !o.isDeleted,
                    ).length
                  }{" "}
                  Dibatalkan
                </span>
              </div>

              <div className="space-y-4">
                {orders.filter(
                  (o) =>
                    o.status === "dibatalkan" &&
                    o.timestamp.toDateString() === new Date().toDateString() &&
                    !o.isDeleted,
                ).length === 0 ? (
                  <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-[#3D2B1F]/5 flex flex-col items-center justify-center text-center">
                    <div className="h-16 w-16 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mb-3">
                      <XCircle size={32} />
                    </div>
                    <p className="text-sm text-[#3D2B1F]/40">
                      Belum ada pesanan dibatalkan hari ini.
                    </p>
                  </div>
                ) : (
                  orders
                    .filter(
                      (o) =>
                        o.status === "dibatalkan" &&
                        o.timestamp.toDateString() ===
                          new Date().toDateString() &&
                        !o.isDeleted,
                    )
                    .sort((a, b) => {
                      const timeA =
                        a.timestamp instanceof Date
                          ? a.timestamp
                          : new Date(a.timestamp);
                      const timeB =
                        b.timestamp instanceof Date
                          ? b.timestamp
                          : new Date(b.timestamp);
                      const timeDiff = timeA.getTime() - timeB.getTime();
                      if (timeDiff !== 0) return timeDiff;
                      const aId = a.firebaseKey || a.id || "";
                      const bId = b.firebaseKey || b.id || "";
                      return aId.localeCompare(bId);
                    })
                    .map((order, idx) => (
                      <div
                        key={
                          order.firebaseKey ||
                          `${order.id}-${order.sessionId || idx}`
                        }
                        className="bg-white p-6 rounded-[2rem] shadow-sm border border-[#3D2B1F]/5 flex flex-col gap-4 border-l-4 border-l-rose-500"
                      >
                        <div className="flex justify-center items-center relative border-b border-[#3D2B1F]/5 pb-3">
                          <div className="text-center">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                              NOTA PESANAN
                            </p>
                            <p className="text-lg font-bold text-[#3D2B1F]">
                              #{getSequentialOrderNumber(order, orders)}
                            </p>
                          </div>
                          <div className="absolute right-0 flex gap-1">
                            <button
                              onClick={() => openEditSalesOrderModal(order)}
                              className="h-8 w-8 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center hover:bg-stone-200 transition-colors"
                              title="Detail"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setOrderToDelete(order.id)}
                              className="h-8 w-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 transition-colors"
                              title="Hapus Pesanan"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-start justify-between border-b border-[#3D2B1F]/5 pb-3">
                          <div className="text-left">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                              INFO PELANGGAN
                            </p>
                            <p className="font-bold text-[#3D2B1F] text-lg">
                              {order.customerName}
                            </p>
                            {order.customerPhone && (
                              <p className="text-xs text-[#3D2B1F]/60 mt-0.5 flex items-center gap-1">
                                <Phone size={10} /> {order.customerPhone}
                              </p>
                            )}
                            {order.customerAddress && (
                              <p className="text-xs text-[#3D2B1F]/60 mt-1 flex items-start gap-1">
                                <MapPin
                                  size={10}
                                  className="mt-0.5 min-w-[10px]"
                                />{" "}
                                <span className="line-clamp-2">
                                  {order.customerAddress}
                                </span>
                              </p>
                            )}
                          </div>
                          <div className="text-right flex flex-col items-end justify-center">
                            <div className="flex items-center justify-end gap-1.5 text-rose-700 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
                              <div className="h-1.5 w-1.5 rounded-full bg-rose-500"></div>
                              <span className="text-[10px] font-bold uppercase tracking-wider">
                                Dibatalkan
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-2">
                              MENU PESANAN
                            </p>
                            {(() => {
                              const grouped = getGroupedItems(order.items);
                              const mains: any[] = [];
                              const addonsMap: Record<string, number> = {};

                              grouped.forEach((gi) => {
                                const nameLower = gi.item.name.toLowerCase();
                                const isToppingName =
                                  ["telur", "sosis", "sayur", "cabe"].some(
                                    (t) => nameLower === t,
                                  ) ||
                                  nameLower.includes("+rp") ||
                                  nameLower.includes("+ rp");
                                const isMenuTambahan =
                                  nameLower === "menu tambahan";

                                if (!isToppingName && !isMenuTambahan) {
                                  mains.push(gi);
                                } else if (isToppingName || isMenuTambahan) {
                                  if (isToppingName) {
                                    addonsMap[gi.item.name] =
                                      (addonsMap[gi.item.name] || 0) +
                                      gi.quantity;
                                  }
                                }
                                const toppingsSource =
                                  gi.accumulatedToppings || gi.toppings;
                                if (
                                  toppingsSource &&
                                  toppingsSource.length > 0
                                ) {
                                  toppingsSource.forEach((t) => {
                                    addonsMap[t] = (addonsMap[t] || 0) + 1;
                                  });
                                }
                              });

                              return (
                                <>
                                  {mains.map((item, idx) => {
                                    const uPrice =
                                      item.item.priceNum ||
                                      parseInt(
                                        item.item.price
                                          ?.toString()
                                          .replace(/[^0-9]/g, "") || "0",
                                      ) ||
                                      0;
                                    return (
                                      <div key={`main-${idx}`} className="mb-2">
                                        <div className="flex justify-between items-start">
                                          <p className="text-sm font-bold text-[#3D2B1F]">
                                            {item.item.name.toLowerCase()} -{" "}
                                            {item.quantity}
                                          </p>
                                          <span className="text-sm font-bold text-[#3D2B1F]">
                                            Rp{" "}
                                            {(
                                              uPrice * item.quantity
                                            ).toLocaleString("id-ID")}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  <div className="border-t border-dashed border-[#3D2B1F]/20 my-2"></div>

                                  {Object.keys(addonsMap).length > 0 && (
                                    <div className="mb-2">
                                      <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-1.5">
                                        ADD ON :
                                      </p>
                                      <div className="space-y-1">
                                        {Object.entries(addonsMap).map(
                                          ([name, count]) => {
                                            const tPrice =
                                              getToppingPrice(name);
                                            const cleanName = name
                                              .split("+")[0]
                                              .split("Rp")[0]
                                              .trim()
                                              .toLowerCase();
                                            const isSaus =
                                              cleanName.includes("saus") ||
                                              cleanName.includes("sambal") ||
                                              cleanName.includes("tomat");
                                            return (
                                              <div
                                                key={name}
                                                className="flex justify-between items-center text-sm font-bold text-[#3D2B1F]"
                                              >
                                                <span>
                                                  {isSaus
                                                    ? cleanName
                                                    : `${cleanName} - ${count}`}
                                                </span>
                                                <span>
                                                  Rp{" "}
                                                  {(
                                                    tPrice * count
                                                  ).toLocaleString("id-ID")}
                                                </span>
                                              </div>
                                            );
                                          },
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                            <div className="border-t border-dashed border-[#3D2B1F]/20 my-2"></div>
                          </div>
                        </div>

                        <div className="space-y-3 pt-1">
                          <div className="flex justify-between items-center uppercase">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 tracking-widest">
                              TOTAL PEMBAYARAN
                            </p>
                            <p className="text-sm font-bold text-[#3D2B1F]">
                              Rp {(order.total || 0).toLocaleString()}
                            </p>
                          </div>
                          {order.items &&
                            Array.isArray(order.items) &&
                            order.items.some((i) => i.notes) && (
                              <div className="pt-1">
                                <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-0.5">
                                  CATATAN PESANAN
                                </p>
                                {order.items
                                  .filter((i) => i.notes)
                                  .map((item, nIdx) => (
                                    <p
                                      key={nIdx}
                                      className="text-[11px] text-[#3D2B1F]/60 italic"
                                    >
                                      - {item.item.name}: {item.notes}
                                    </p>
                                  ))}
                              </div>
                            )}

                          {order.notes && (
                            <div className="bg-orange-50/50 p-3 rounded-xl border border-orange-100/50 my-1">
                              <p className="text-[9px] font-bold text-orange-700 uppercase tracking-widest mb-1 font-black">
                                CATATAN TRANSAKSI (KHUSUS)
                              </p>
                              <p className="text-[11px] font-bold text-[#3D2B1F]/80">
                                {order.notes}
                              </p>
                            </div>
                          )}

                          <div className="flex justify-between items-center">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                              METODE PEMBAYARAN
                            </p>
                            <p className="text-sm font-bold text-[#3D2B1F]">
                              {order.paymentMethod || "TUNAI"}
                            </p>
                          </div>
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                              JAM PEMESANAN
                            </p>
                            <p className="text-sm font-bold text-[#3D2B1F]">
                              {order.timestamp.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === "rating" && (
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
                  Rating & Feedback
                </h2>
              </div>
            </div>

            <div className="space-y-4">
              {/* Combine Order Ratings and App Feedback */}
              {[
                ...orders
                  .filter((o) => o.rating)
                  .map((o) => ({
                    id: o.firebaseKey || o.id,
                    type: "Order" as "Order" | "Aplikasi",
                    name: o.customerName || "Pelanggan",
                    rating: o.rating || 0,
                    comment: o.feedback || "",
                    timestamp: o.timestamp ? new Date(o.timestamp) : new Date(),
                  })),
                ...feedbacks
                  .filter((f) => f.type !== "Kuesioner")
                  .map((f) => ({
                    id: f.id || "",
                    type: (f.type || "Aplikasi") as any,
                    name: f.userName || "Pelanggan",
                    rating: f.rating || 0,
                    comment: f.comment || "",
                    timestamp: f.timestamp ? new Date(f.timestamp) : new Date(),
                  })),
              ]
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                .map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-white p-5 rounded-[2rem] shadow-sm border border-[#3D2B1F]/5 relative"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-bold text-[#3D2B1F]">
                          {item.name}
                        </h4>
                        <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                          Feedback {item.type}
                        </p>
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
                          title="Hapus Feedback"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mb-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={14}
                          fill={star <= item.rating ? "#FBBF24" : "none"}
                          className={
                            star <= item.rating
                              ? "text-yellow-400"
                              : "text-gray-300"
                          }
                        />
                      ))}
                    </div>
                    {item.comment && (
                      <p className="text-sm text-[#3D2B1F]/70 italic">
                        "{item.comment}"
                      </p>
                    )}
                  </div>
                ))}
              {orders.filter((o) => o.rating).length === 0 &&
                feedbacks.length === 0 && (
                  <div className="text-center py-12">
                    <div className="h-16 w-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4 text-stone-400">
                      <Star size={32} />
                    </div>
                    <p className="text-sm font-bold text-[#3D2B1F]/40">
                      Belum ada rating masuk
                    </p>
                  </div>
                )}
            </div>
          </div>
        )}

        {activeTab === "kuesioner" && (
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
              {feedbacks.filter((f) => f.type === "Kuesioner").length > 0 && (
                <button
                  onClick={handleGenerateKuesionerSummary}
                  disabled={isGeneratingKuesionerSummary}
                  className="flex items-center gap-2 px-4 py-2 bg-[#D4AF37] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#C5A028] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isGeneratingKuesionerSummary ? (
                    <span className="animate-pulse">Loading...</span>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span className="hidden sm:inline">Rangkuman AI</span>
                      <span className="sm:hidden">AI</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {aiKuesionerSummary && (
              <div className="bg-gradient-to-br from-[#D4AF37]/10 to-[#D4AF37]/5 p-5 rounded-[2rem] border border-[#D4AF37]/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                  <Sparkles size={64} />
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={18} className="text-[#D4AF37]" />
                  <h3 className="font-bold text-[#3D2B1F]">Rangkuman AI</h3>
                </div>
                <div className="text-sm text-[#3D2B1F]/80 leading-relaxed [&>p]:mb-4 [&>ul]:list-disc [&>ul]:ml-5 [&>ul]:mb-4 [&>ul>li]:mb-2 [&>ol]:list-decimal [&>ol]:ml-5 [&>ol]:mb-4 [&>ol>li]:mb-2 [&>h1]:font-bold [&>h1]:text-lg [&>h1]:mb-3 [&>h1]:mt-5 [&>h2]:font-bold [&>h2]:text-base [&>h2]:mb-3 [&>h2]:mt-4 [&>h3]:font-bold [&>h3]:mb-2 [&>h3]:mt-3">
                  <Markdown>{aiKuesionerSummary}</Markdown>
                </div>
              </div>
            )}

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
                                type: item.type as
                                  | "Aplikasi"
                                  | "Order"
                                  | "Kuesioner",
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
                              {k === "q1" && "1. Mudah Menemukan Menu"}
                              {k === "q2" && "2. Tampilan & Desain"}
                              {k === "q3" && "3. Kemudahan Keranjang Belanja"}
                              {k === "q4" && "4. Kendala Teknis"}
                              {k === "q5" && "5. Alur Pemesanan"}
                              {k === "q6" && "6. Saran & Masukan"}
                            </span>
                            <p className="font-medium text-[#3D2B1F]">
                              {String(v)}
                            </p>
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

        {activeTab === "laporan" && (
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
                  Laporan Penjualan
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadReport}
                  className="h-10 w-10 flex items-center justify-center bg-[#D4AF37] text-white rounded-xl shadow-md hover:bg-[#B8962F] transition-all active:scale-95"
                  title="Download Rekap Laporan (.csv)"
                >
                  <Download size={20} />
                </button>
              </div>
            </div>

            {/* Filter Section */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-[#3D2B1F]/5">
              <div className="flex flex-col gap-3 mb-4">
                <h3 className="font-bold text-[#3D2B1F]">Filter Penjualan</h3>
                <div className="flex bg-[#F5F2EA] rounded-xl p-1 w-full sm:w-auto overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => setReportFilterType("hari")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${reportFilterType === "hari" ? "bg-white text-[#3D2B1F] shadow-sm" : "text-[#3D2B1F]/40"}`}
                  >
                    Harian
                  </button>
                  <button
                    onClick={() => setReportFilterType("minggu")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${reportFilterType === "minggu" ? "bg-white text-[#3D2B1F] shadow-sm" : "text-[#3D2B1F]/40"}`}
                  >
                    Mingguan
                  </button>
                  <button
                    onClick={() => setReportFilterType("bulan")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${reportFilterType === "bulan" ? "bg-white text-[#3D2B1F] shadow-sm" : "text-[#3D2B1F]/40"}`}
                  >
                    Bulanan
                  </button>
                  <button
                    onClick={() => setReportFilterType("semua")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${reportFilterType === "semua" ? "bg-white text-[#3D2B1F] shadow-sm" : "text-[#3D2B1F]/40"}`}
                  >
                    Total
                  </button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2 w-full">
                {reportFilterType !== "semua" && (
                  <button
                    onClick={() => setShowDatePicker(true)}
                    className="w-full flex-1 min-w-0 bg-[#F5F2EA] rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 transition-all text-left"
                  >
                    {reportFilterType === "bulan"
                      ? parseDateString(reportFilterDate).toLocaleDateString(
                          "id-ID",
                          { month: "long", year: "numeric" },
                        )
                      : reportFilterType === "minggu"
                        ? (() => {
                            const d = parseDateString(reportFilterDate);
                            const year = d.getFullYear();
                            const firstDayOfYear = new Date(year, 0, 1);
                            const pastDaysOfYear =
                              (d.getTime() - firstDayOfYear.getTime()) /
                              86400000;
                            const weekNum = Math.ceil(
                              (pastDaysOfYear + firstDayOfYear.getDay() + 1) /
                                7,
                            );
                            return `Minggu ${weekNum}, ${year}`;
                          })()
                        : parseDateString(reportFilterDate).toLocaleDateString(
                            "id-ID",
                            {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            },
                          )}
                  </button>
                )}
                <div
                  className={`${reportFilterType === "semua" ? "w-full" : "w-full flex-1 min-w-0"}`}
                >
                  <select
                    value={reportFilterMenu}
                    onChange={(e) => setReportFilterMenu(e.target.value)}
                    className="w-full bg-[#F5F2EA] rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] focus:outline-none appearance-none text-ellipsis overflow-hidden whitespace-nowrap"
                    style={{
                      backgroundImage:
                        'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%233D2B1F%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 1rem top 50%",
                      backgroundSize: "0.65rem auto",
                      paddingRight: "2.5rem",
                    }}
                  >
                    <option value="semua">Semua Menu</option>
                    {uniqueMenuItems.map((menu) => (
                      <option key={menu} value={menu}>
                        {menu}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {showDatePicker && (
                <div className="w-full bg-white rounded-2xl p-4 shadow-lg border border-[#3D2B1F]/10 mt-2 overflow-hidden relative">
                  <div className="flex flex-col gap-4">
                    {/* Month/Year Navigation */}
                    <div className="flex justify-between items-center px-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const d = parseDateString(reportFilterDate);
                          d.setMonth(d.getMonth() - 1);
                          setReportFilterDate(formatDateToString(d));
                        }}
                        className="p-2 hover:bg-stone-100 rounded-full text-[#3D2B1F]"
                      >
                        <ChevronRight className="rotate-180" size={20} />
                      </button>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-[#3D2B1F] text-sm">
                          {parseDateString(reportFilterDate).toLocaleDateString(
                            "id-ID",
                            {
                              month: "long",
                              year: "numeric",
                            },
                          )}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowYearPicker(!showYearPicker);
                          }}
                          className="p-1 hover:bg-stone-100 rounded-md text-[#3D2B1F]"
                        >
                          <Calendar size={14} />
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const d = parseDateString(reportFilterDate);
                          d.setMonth(d.getMonth() + 1);
                          setReportFilterDate(formatDateToString(d));
                        }}
                        className="p-2 hover:bg-stone-100 rounded-full text-[#3D2B1F]"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </div>

                    {/* Year Picker Overlay */}
                    {showYearPicker && (
                      <div className="absolute inset-0 z-10 bg-white p-4 overflow-y-auto no-scrollbar">
                        <div className="flex justify-between items-center mb-4">
                          <span className="font-bold text-[#3D2B1F]">
                            Pilih Tahun
                          </span>
                          <button
                            onClick={() => setShowYearPicker(false)}
                            className="p-1 hover:bg-stone-100 rounded-full"
                          >
                            <X size={20} />
                          </button>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {Array.from(
                            { length: 11 },
                            (_, i) => new Date().getFullYear() - 5 + i,
                          ).map((year) => (
                            <button
                              key={year}
                              onClick={(e) => {
                                e.stopPropagation();
                                const d = parseDateString(reportFilterDate);
                                d.setFullYear(year);
                                setReportFilterDate(formatDateToString(d));
                                setShowYearPicker(false);
                              }}
                              className={`py-2 rounded-xl text-sm font-bold transition-all ${
                                parseDateString(
                                  reportFilterDate,
                                ).getFullYear() === year
                                  ? "bg-[#3D2B1F] text-white"
                                  : "text-[#3D2B1F] hover:bg-stone-100"
                              }`}
                            >
                              {year}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {reportFilterType === "bulan" ? (
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          "Jan",
                          "Feb",
                          "Mar",
                          "Apr",
                          "Mei",
                          "Jun",
                          "Jul",
                          "Agu",
                          "Sep",
                          "Okt",
                          "Nov",
                          "Des",
                        ].map((m, i) => {
                          const isSelected =
                            parseDateString(reportFilterDate).getMonth() === i;
                          return (
                            <button
                              key={m}
                              onClick={(e) => {
                                e.stopPropagation();
                                const d = parseDateString(reportFilterDate);
                                d.setMonth(i);
                                setReportFilterDate(formatDateToString(d));
                                setShowDatePicker(false);
                              }}
                              className={`py-3 rounded-xl text-sm font-bold transition-all ${
                                isSelected
                                  ? "bg-[#3D2B1F] text-white"
                                  : "text-[#3D2B1F] hover:bg-stone-100"
                              }`}
                            >
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-7 gap-1">
                        {["M", "S", "S", "R", "K", "J", "S"].map((day, i) => (
                          <div
                            key={i}
                            className="text-center text-[10px] font-bold text-[#3D2B1F]/40 py-2"
                          >
                            {day}
                          </div>
                        ))}
                        {(() => {
                          const date = parseDateString(reportFilterDate);
                          const year = date.getFullYear();
                          const month = date.getMonth();
                          const firstDay = new Date(year, month, 1).getDay();
                          const daysInMonth = new Date(
                            year,
                            month + 1,
                            0,
                          ).getDate();
                          const days = [];

                          for (let i = 0; i < firstDay; i++) {
                            days.push(
                              <div key={`empty-${i}`} className="h-10" />,
                            );
                          }

                          for (let d = 1; d <= daysInMonth; d++) {
                            const currentDayDate = new Date(year, month, d);
                            let isSelected = false;

                            if (reportFilterType === "minggu") {
                              // User requested: "Hapus efek kotak-kotak... Cukup beri warna lingkaran pada satu tanggal yang dipilih saja"
                              // So even in weekly view, we only highlight the specific selected date with a circle.
                              isSelected =
                                parseDateString(reportFilterDate).getDate() ===
                                d;
                            } else {
                              isSelected =
                                parseDateString(reportFilterDate).getDate() ===
                                d;
                            }

                            days.push(
                              <button
                                key={d}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReportFilterDate(
                                    formatDateToString(currentDayDate),
                                  );
                                  setShowDatePicker(false);
                                }}
                                className={`h-10 w-full flex items-center justify-center rounded-full text-sm font-bold transition-all ${
                                  isSelected
                                    ? "bg-[#3D2B1F] text-white shadow-md"
                                    : "text-[#3D2B1F] hover:bg-stone-100"
                                }`}
                              >
                                {d}
                              </button>,
                            );
                          }
                          return days;
                        })()}
                      </div>
                    )}

                    <button
                      onClick={() => setShowDatePicker(false)}
                      className="w-full py-3 bg-[#F5F2EA] text-[#3D2B1F] rounded-xl font-bold text-xs mt-2 hover:bg-[#EAE5D8] transition-colors"
                    >
                      Tutup Kalender
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Filtered Report Cards & Chart */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#3D2B1F]/5">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-[#F5F2EA] p-5 rounded-2xl relative">
                  <div className="mb-1 pr-6">
                    <p className="text-[9px] font-bold text-[#3D2B1F]/40 uppercase tracking-wider">
                      Omzet{" "}
                      {reportFilterType === "hari"
                        ? "(Hari Ini)"
                        : reportFilterType === "minggu"
                          ? "(Minggu Ini)"
                          : reportFilterType === "bulan"
                            ? "(Bulan Ini)"
                            : "(Semua)"}
                    </p>
                  </div>
                  <p className="text-xl font-bold text-[#D4AF37]">
                    Rp{(filteredReportData.revenue || 0).toLocaleString()}
                  </p>
                  <button
                    onClick={() => {
                      setEditNominalTarget(reportFilterType);
                      setEditNominalOmzet(
                        filteredReportData.revenue.toString(),
                      );
                      setEditNominalProfit(
                        filteredReportData.profit.toString(),
                      );
                      setIsEditNominalModalOpen(true);
                    }}
                    className="absolute top-4 right-4 h-6 w-6 flex items-center justify-center bg-[#3D2B1F] text-white rounded-full shadow-md hover:bg-black transition-all text-[10px] font-bold"
                    title="Edit Nominal"
                  >
                    +
                  </button>
                </div>
                <div className="bg-[#F5F2EA] p-5 rounded-2xl relative">
                  <div className="mb-1 pr-6">
                    <p className="text-[9px] font-bold text-[#3D2B1F]/40 uppercase tracking-wider">
                      Profit{" "}
                      {reportFilterType === "hari"
                        ? "(Hari Ini)"
                        : reportFilterType === "minggu"
                          ? "(Minggu Ini)"
                          : reportFilterType === "bulan"
                            ? "(Bulan Ini)"
                            : "(Semua)"}
                    </p>
                  </div>
                  <p className="text-xl font-bold text-green-600">
                    Rp{(filteredReportData.profit || 0).toLocaleString()}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                      {filteredReportData.revenue > 0
                        ? (
                            (filteredReportData.profit /
                              filteredReportData.revenue) *
                            100
                          ).toFixed(1)
                        : 0}
                      %
                    </span>
                    <span className="text-[8px] text-[#3D2B1F]/40 font-bold uppercase tracking-tighter">
                      Margin
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setEditNominalTarget(reportFilterType);
                      setEditNominalOmzet(
                        filteredReportData.revenue.toString(),
                      );
                      setEditNominalProfit(
                        filteredReportData.profit.toString(),
                      );
                      setIsEditNominalModalOpen(true);
                    }}
                    className="absolute top-4 right-4 h-6 w-6 flex items-center justify-center bg-[#3D2B1F] text-white rounded-full shadow-md hover:bg-black transition-all text-[10px] font-bold"
                    title="Edit Nominal"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#3D2B1F]">Grafik Penjualan</h3>
              </div>
              <div className="h-80 w-full overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={
                      filteredReportData.chartData.length > 0
                        ? filteredReportData.chartData
                        : [{ name: "Data", sales: 0, profit: 0 }]
                    }
                    margin={{ top: 20, right: 10, left: 10, bottom: 20 }}
                    barCategoryGap={
                      reportFilterType === "bulan"
                        ? "10%"
                        : reportFilterType === "hari"
                          ? "15%"
                          : "20%"
                    }
                    barGap={
                      reportFilterType === "bulan" ||
                      reportFilterType === "semua"
                        ? 1
                        : 2
                    }
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#E5E5E5"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9, fill: "#999" }}
                      interval={reportFilterType === "bulan" ? 2 : 0}
                      minTickGap={reportFilterType === "bulan" ? 10 : 5}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#999" }}
                      domain={[0, "auto"]}
                      allowDataOverflow={false}
                      tickFormatter={(value) => {
                        if (Math.abs(value) >= 1000000) {
                          const val = value / 1000000;
                          return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}jt`;
                        }
                        if (Math.abs(value) >= 1000) {
                          const val = value / 1000;
                          return `${val.toFixed(0)}rb`;
                        }
                        return `${value}`;
                      }}
                    />
                    <Tooltip
                      formatter={(value: number) =>
                        `Rp ${(value || 0).toLocaleString()}`
                      }
                      contentStyle={{
                        borderRadius: "12px",
                        border: "none",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      }}
                      cursor={{ fill: "transparent" }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
                    />
                    <Bar
                      dataKey="sales"
                      name="Omzet"
                      fill="#D4AF37"
                      maxBarSize={reportFilterType === "bulan" ? 30 : 64}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="profit"
                      name="Profit"
                      fill="#16a34a"
                      maxBarSize={reportFilterType === "bulan" ? 30 : 64}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#3D2B1F]/5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-[#3D2B1F]">
                    Riwayat Transaksi
                  </h3>
                  {isUploading && (
                    <span className="text-xs font-bold text-[#D4AF37] animate-pulse whitespace-nowrap">
                      Mengunggah...
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setTargetOrderId(null);
                      csvInputRef.current?.click();
                    }}
                    className="h-8 w-8 flex items-center justify-center bg-white border border-[#3D2B1F]/10 text-[#3D2B1F] rounded-lg shadow-sm hover:bg-stone-50 transition-all active:scale-95"
                    title="Import Data Penjualan (CSV/Gambar/PDF/Excel/Word)"
                  >
                    <Paperclip size={16} />
                  </button>
                  <button
                    id="bulk-delete-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsMassDeleteModalOpen(true);
                    }}
                    className="h-10 w-10 flex items-center justify-center bg-red-50 text-red-500 rounded-xl shadow-sm hover:bg-red-100 transition-all cursor-pointer relative z-10"
                    title="Hapus Seluruh Data Berdasarkan Filter"
                  >
                    <Trash2 size={20} />
                  </button>
                  {isSelectMode && selectedOrders.length > 0 && (
                    <button
                      onClick={() => {
                        onDeleteOrder(selectedOrders);
                        setSelectedOrders([]);
                        setIsSelectMode(false);
                      }}
                      className="h-8 px-3 flex items-center justify-center bg-red-500 text-white rounded-lg shadow-md hover:bg-red-600 transition-all active:scale-95 text-xs font-bold"
                    >
                      Hapus ({selectedOrders.length})
                    </button>
                  )}
                  <button
                    onClick={() => setIsManualOrderModalOpen(true)}
                    className="h-8 w-8 flex items-center justify-center bg-[#3D2B1F] text-white rounded-lg shadow-md hover:bg-black transition-all active:scale-95"
                    title="Tambah Penjualan Manual"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                {filteredReportData.riwayatOrders
                  .filter(
                    (o: any) =>
                      o.status === "selesai" || o.status === "dibatalkan",
                  )
                  .sort((a, b) => {
                    const timeA =
                      a.timestamp instanceof Date
                        ? a.timestamp
                        : new Date(a.timestamp);
                    const timeB =
                      b.timestamp instanceof Date
                        ? b.timestamp
                        : new Date(b.timestamp);
                    const timeDiff = timeA.getTime() - timeB.getTime();
                    if (timeDiff !== 0) return timeDiff;
                    const aId = a.firebaseKey || a.id || "";
                    const bId = b.firebaseKey || b.id || "";
                    return aId.localeCompare(bId);
                  }).length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-[#3D2B1F]/40 text-sm font-bold">
                      Belum ada riwayat transaksi
                    </p>
                  </div>
                ) : (
                  filteredReportData.riwayatOrders
                    .filter(
                      (o: any) =>
                        o.status === "selesai" || o.status === "dibatalkan",
                    )
                    .sort((a, b) => {
                      const timeA =
                        a.timestamp instanceof Date
                          ? a.timestamp
                          : new Date(a.timestamp);
                      const timeB =
                        b.timestamp instanceof Date
                          ? b.timestamp
                          : new Date(b.timestamp);
                      const timeDiff = timeA.getTime() - timeB.getTime();
                      if (timeDiff !== 0) return timeDiff;
                      const aId = a.firebaseKey || a.id || "";
                      const bId = b.firebaseKey || b.id || "";
                      return aId.localeCompare(bId);
                    })
                    .map((order: any, idx: number) => (
                      <div
                        key={
                          order.firebaseKey ||
                          `${order.id}-${order.sessionId || idx}`
                        }
                        className="bg-white p-6 rounded-[2rem] border border-[#3D2B1F]/5 shadow-sm flex flex-col gap-4 relative overflow-hidden"
                      >
                        {isSelectMode && (
                          <div
                            className="absolute top-4 left-4 z-10 cursor-pointer"
                            onClick={() => {
                              const actualId =
                                order.firebaseKey || String(order.id);
                              if (selectedOrders.includes(actualId)) {
                                setSelectedOrders(
                                  selectedOrders.filter(
                                    (id) => id !== actualId,
                                  ),
                                );
                              } else {
                                setSelectedOrders([
                                  ...selectedOrders,
                                  actualId,
                                ]);
                              }
                            }}
                          >
                            {selectedOrders.includes(
                              order.firebaseKey || String(order.id),
                            ) ? (
                              <CheckSquare
                                className="text-[#3D2B1F]"
                                size={20}
                              />
                            ) : (
                              <Square className="text-[#3D2B1F]/40" size={20} />
                            )}
                          </div>
                        )}

                        <div className="flex justify-center items-center relative border-b border-[#3D2B1F]/5 pb-3">
                          <div className="text-center">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                              NOTA PESANAN
                            </p>
                            <p className="text-lg font-bold text-[#3D2B1F]">
                              #{getSequentialOrderNumber(order, orders)}
                            </p>
                          </div>
                          <div className="absolute right-0 flex gap-1">
                            <button
                              onClick={() => openEditSalesOrderModal(order)}
                              className="h-8 w-8 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center hover:bg-stone-200 transition-colors"
                              title="Edit Transaksi"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setOrderToDelete(order.id)}
                              className="h-8 w-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 transition-colors"
                              title="Hapus Transaksi"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-start justify-between border-b border-[#3D2B1F]/5 pb-3">
                          <div className="text-left">
                            <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                              INFO PELANGGAN
                            </p>
                            <p className="font-bold text-[#3D2B1F] text-lg mt-0.5">
                              {order.customerName || "Pelanggan"}
                            </p>
                            {order.customerPhone && (
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="font-bold text-[#3D2B1F]/80 text-sm flex items-center gap-1">
                                  <Phone size={12} /> {order.customerPhone}
                                </p>
                              </div>
                            )}
                            {order.customerAddress && (
                              <p className="text-xs text-[#3D2B1F]/60 mt-1 flex items-start gap-1">
                                <MapPin
                                  size={10}
                                  className="mt-0.5 min-w-[10px]"
                                />{" "}
                                <span className="line-clamp-2">
                                  {order.customerAddress}
                                </span>
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end justify-center">
                            <span
                              className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                                order.status === "selesai"
                                  ? "bg-green-50 text-green-600"
                                  : "bg-red-50 text-red-600"
                              }`}
                            >
                              {order.status}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div
                            className="cursor-pointer hover:bg-[#3D2B1F]/5 p-2 -m-2 rounded-xl transition-colors"
                            onClick={() => openEditSalesOrderModal(order)}
                          >
                            <div>
                              <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-2">
                                MENU PESANAN
                              </p>
                              {!order.items || order.items.length === 0 ? (
                                <p className="text-[10px] text-[#3D2B1F]/40 italic">
                                  Belum ada rincian menu. Klik untuk edit.
                                </p>
                              ) : (
                                (() => {
                                  const grouped = getGroupedItems(order.items);
                                  const mains: any[] = [];
                                  const addonsMap: Record<string, number> = {};

                                  grouped.forEach((gi) => {
                                    const nameLower =
                                      gi.item.name.toLowerCase();
                                    const isToppingName =
                                      ["telur", "sosis", "sayur", "cabe"].some(
                                        (t) => nameLower === t,
                                      ) ||
                                      nameLower.includes("+rp") ||
                                      nameLower.includes("+ rp");
                                    const isMenuTambahan =
                                      nameLower === "menu tambahan";

                                    if (!isToppingName && !isMenuTambahan) {
                                      mains.push(gi);
                                    } else if (
                                      isToppingName ||
                                      isMenuTambahan
                                    ) {
                                      if (isToppingName) {
                                        addonsMap[gi.item.name] =
                                          (addonsMap[gi.item.name] || 0) +
                                          gi.quantity;
                                      }
                                    }
                                    const toppingsSource =
                                      gi.accumulatedToppings || gi.toppings;
                                    if (
                                      toppingsSource &&
                                      toppingsSource.length > 0
                                    ) {
                                      toppingsSource.forEach((t) => {
                                        addonsMap[t] = (addonsMap[t] || 0) + 1;
                                      });
                                    }
                                  });

                                  return (
                                    <>
                                      {mains.map((item, idx) => {
                                        const uPrice =
                                          item.item.priceNum ||
                                          parseInt(
                                            item.item.price
                                              ?.toString()
                                              .replace(/[^0-9]/g, "") || "0",
                                          ) ||
                                          0;
                                        return (
                                          <div
                                            key={`main-${idx}`}
                                            className="mb-2"
                                          >
                                            <div className="flex justify-between items-start">
                                              <p className="text-sm font-bold text-[#3D2B1F] leading-tight">
                                                {item.item.name.toLowerCase()} -{" "}
                                                {item.quantity}
                                              </p>
                                              <span className="text-sm font-bold text-[#3D2B1F] whitespace-nowrap">
                                                Rp{" "}
                                                {(
                                                  uPrice * item.quantity
                                                ).toLocaleString("id-ID")}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}

                                      <div className="border-t border-dashed border-[#3D2B1F]/20 my-2"></div>

                                      {Object.keys(addonsMap).length > 0 && (
                                        <div className="mb-2">
                                          <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-1.5">
                                            ADD ON :
                                          </p>
                                          <div className="space-y-1">
                                            {Object.entries(addonsMap).map(
                                              ([name, count]) => {
                                                const tPrice =
                                                  getToppingPrice(name);
                                                const cleanName = name
                                                  .split("+")[0]
                                                  .split("Rp")[0]
                                                  .trim()
                                                  .toLowerCase();
                                                const isSaus =
                                                  cleanName.includes("saus") ||
                                                  cleanName.includes(
                                                    "sambal",
                                                  ) ||
                                                  cleanName.includes("tomat");
                                                return (
                                                  <div
                                                    key={name}
                                                    className="flex justify-between items-center text-sm font-bold text-[#3D2B1F] tracking-tight"
                                                  >
                                                    <span>
                                                      {isSaus
                                                        ? cleanName
                                                        : `${cleanName} - ${count}`}
                                                    </span>
                                                    <span>
                                                      Rp{" "}
                                                      {(
                                                        tPrice * count
                                                      ).toLocaleString("id-ID")}
                                                    </span>
                                                  </div>
                                                );
                                              },
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  );
                                })()
                              )}

                              <div className="border-t border-dashed border-[#3D2B1F]/20 my-2"></div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="bg-[#FAF9F6] p-5 rounded-[1.5rem] border border-[#D4AF37]/10 flex justify-between items-center">
                              <p className="text-[10px] font-bold text-[#3D2B1F]/40 tracking-widest uppercase">
                                TOTAL PEMBAYARAN
                              </p>
                              <p className="text-sm font-bold text-[#3D2B1F]">
                                Rp {(order.total || 0).toLocaleString("id-ID")}
                              </p>
                            </div>

                            {order.items &&
                              Array.isArray(order.items) &&
                              order.items.some((i) => i.notes) && (
                                <div className="bg-[#FAF9F6] p-3 rounded-xl border border-[#3D2B1F]/5">
                                  <p className="text-[9px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-1">
                                    CATATAN PESANAN
                                  </p>
                                  {order.items
                                    .filter((i) => i.notes)
                                    .map((item, nIdx) => (
                                      <div
                                        key={nIdx}
                                        className="flex items-start gap-1 text-[11px] text-[#3D2B1F]/50 italic"
                                      >
                                        <span className="text-[#D4AF37]">
                                          •
                                        </span>
                                        <p>
                                          {item.item.name}: {item.notes}
                                        </p>
                                      </div>
                                    ))}
                                </div>
                              )}

                            {order.notes && (
                              <div className="bg-orange-50/50 p-3 rounded-xl border border-orange-100/50">
                                <p className="text-[9px] font-bold text-orange-700 uppercase tracking-widest mb-1">
                                  CATATAN TRANSAKSI (KHUSUS)
                                </p>
                                <p className="text-[12px] font-bold text-[#3D2B1F]/80">
                                  {order.notes}
                                </p>
                              </div>
                            )}

                            <div className="space-y-4 px-1">
                              <div className="flex justify-between items-center">
                                <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-[0.1em]">
                                  METODE PEMBAYARAN
                                </p>
                                <p className="text-sm font-bold text-[#3D2B1F]">
                                  {order.paymentMethod || "TUNAI"}
                                </p>
                              </div>
                              <div className="flex justify-between items-center">
                                <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-[0.1em]">
                                  JAM PEMESANAN
                                </p>
                                <p className="text-sm font-bold text-[#3D2B1F]">
                                  {order.timestamp.toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </p>
                              </div>
                            </div>

                            {/* Attachment Section */}
                            {order.attachmentUrl || order.fileUrl ? (
                              <div className="pt-4 border-t border-[#3D2B1F]/5">
                                <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-3 flex items-center gap-1">
                                  <Paperclip
                                    size={10}
                                    className="text-[#D4AF37]"
                                  />{" "}
                                  LAMPIRAN DOKUMEN
                                </p>
                                <div className="bg-[#3D2B1F]/5 p-3 rounded-[1.5rem] flex flex-col gap-3">
                                  {order.attachmentType === "image" &&
                                    (order.attachmentUrl || order.fileUrl) && (
                                      <div
                                        className="relative group w-full aspect-video rounded-xl overflow-hidden border border-[#3D2B1F]/10 shadow-sm cursor-pointer"
                                        onClick={() =>
                                          window.open(
                                            order.attachmentUrl ||
                                              order.fileUrl,
                                            "_blank",
                                          )
                                        }
                                      >
                                        <img
                                          src={
                                            order.attachmentUrl || order.fileUrl
                                          }
                                          alt="Attachment Preview"
                                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                          referrerPolicy="no-referrer"
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all">
                                          <div className="bg-white/90 p-2 rounded-full scale-0 group-hover:scale-100 transition-transform">
                                            <ImageIcon
                                              size={16}
                                              className="text-[#3D2B1F]"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => {
                                        const a = document.createElement("a");
                                        a.href = (order.attachmentUrl ||
                                          order.fileUrl) as string;
                                        a.download =
                                          order.attachmentName || "Lampiran";
                                        a.click();
                                      }}
                                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white text-[#3D2B1F] rounded-xl border border-stone-200 shadow-sm active:scale-95 transition-all text-xs font-bold"
                                    >
                                      <Download size={14} />
                                      Unduh Berkas
                                    </button>
                                    <button
                                      onClick={() => {
                                        setTargetOrderId(
                                          order.firebaseKey || order.id,
                                        );
                                        imageInputRef.current?.click();
                                      }}
                                      className="h-10 w-10 flex items-center justify-center bg-white text-[#D4AF37] rounded-xl border border-[#D4AF37]/20 shadow-sm active:scale-95 transition-all"
                                      title="Ganti Lampiran"
                                    >
                                      <RefreshCw size={14} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "stok" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setActiveTab("beranda")}
                className="h-8 w-8 flex items-center justify-center rounded-full bg-white border border-[#3D2B1F]/5 shadow-sm"
              >
                <ArrowLeft size={16} />
              </button>
              <h2 className="text-xl font-bold text-[#3D2B1F]">
                Manajemen Stok
              </h2>
            </div>

            {/* Low Stock Notifications */}
            {lowStockItems.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-red-800">
                    Stok Menipis: {lowStockItems.length} Item
                  </p>
                  <p className="text-[10px] text-red-600">
                    {lowStockItems
                      .slice(0, 2)
                      .map((i) => i.name)
                      .join(", ")}{" "}
                    {lowStockItems.length > 2 ? "..." : ""} hampir habis.
                  </p>
                </div>
              </div>
            )}

            {/* Editable Stock Management */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-[#3D2B1F]">
                  Manajemen Stok Bahan
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsAddItemModalOpen(true)}
                    className="h-8 px-3 rounded-lg bg-[#3D2B1F] text-white flex items-center justify-center hover:bg-black transition-colors shadow-sm text-xs font-bold"
                    title="Tambah Bahan Baru"
                  >
                    Tambah Bahan
                  </button>
                </div>
              </div>
              {inventory.map((item) => {
                const IconComponent = IconMap[item.icon] || Package;
                const isLowStock = item.stock <= (item.min || 0);
                return (
                  <div
                    key={item.id}
                    className="bg-white p-3 sm:p-4 rounded-2xl border border-[#3D2B1F]/5 shadow-sm flex items-center justify-between gap-2 relative group"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`shrink-0 h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center overflow-hidden ${item.color}`}
                      >
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl
                              .replace(
                                "github.com",
                                "raw.githubusercontent.com",
                              )
                              .replace("/blob/", "/")}
                            alt={item.name}
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <IconComponent size={24} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-[#3D2B1F] text-sm sm:text-base leading-tight break-words">
                          {item.name}
                        </p>
                        <p
                          className={`text-[10px] sm:text-xs font-bold mt-0.5 ${item.stock === 0 ? "text-red-500" : isLowStock ? "text-orange-500" : "text-green-600"}`}
                        >
                          {item.stock === 0
                            ? "Habis"
                            : isLowStock
                              ? "Stok Menipis"
                              : "Tersedia"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <button
                        onClick={() =>
                          onUpdateStock(
                            item.id,
                            Math.max(0, (Number(item.stock) || 0) - 1),
                          )
                        }
                        className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 rounded-full bg-[#3D2B1F]/5 flex items-center justify-center text-[#3D2B1F] hover:bg-[#3D2B1F]/10"
                      >
                        <Minus size={14} />
                      </button>
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          step="any"
                          value={
                            editingStocks[item.id] !== undefined
                              ? editingStocks[item.id]
                              : item.stock
                          }
                          onChange={(e) => {
                            let val = e.target.value;
                            if (
                              val.length > 1 &&
                              val.startsWith("0") &&
                              !val.startsWith("0.")
                            ) {
                              val = val.replace(/^0+/, "");
                              if (val === "") val = "0";
                            }
                            setEditingStocks((prev) => ({
                              ...prev,
                              [item.id]: val,
                            }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            }
                          }}
                          onBlur={(e) => {
                            console.log(
                              "onBlur triggered for item:",
                              item.id,
                              "value:",
                              e.target.value,
                            );
                            const val = parseFloat(e.target.value);
                            onUpdateStock(
                              item.id,
                              isNaN(val) ? 0 : Math.max(0, val),
                            );
                            setEditingStocks((prev) => {
                              const next = { ...prev };
                              delete next[item.id];
                              return next;
                            });
                          }}
                          min="0"
                          className="w-12 sm:w-14 text-center font-bold text-[#3D2B1F] text-sm bg-[#F5F2EA] rounded-lg py-1"
                        />
                        <span className="text-[9px] sm:text-[10px] font-bold text-[#3D2B1F]/40 mt-0.5">
                          {item.unit}
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          onUpdateStock(item.id, (Number(item.stock) || 0) + 1)
                        }
                        className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 rounded-full bg-[#3D2B1F] text-white flex items-center justify-center hover:bg-black"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={() => onDeleteItem(item.id)}
                        className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 rounded-full bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-200 ml-0.5 sm:ml-1"
                        title="Hapus Stok"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "sampah" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xl font-bold text-[#3D2B1F]">
                Tempat Sampah
              </h3>
              <span className="bg-stone-100 text-[#3D2B1F]/60 text-[10px] font-bold px-3 py-1 rounded-full">
                {orders.filter((o) => o.isDeleted).length} Item
              </span>
            </div>

            <div className="space-y-4">
              {orders.filter((o) => o.isDeleted).length === 0 ? (
                <div className="bg-white p-12 rounded-[2.5rem] shadow-sm border border-[#3D2B1F]/5 flex flex-col items-center justify-center text-center">
                  <div className="h-20 w-20 rounded-full bg-[#3D2B1F]/5 flex items-center justify-center text-[#3D2B1F]/10 mb-4">
                    <Trash2 size={40} />
                  </div>
                  <h4 className="text-lg font-bold text-[#3D2B1F] mb-1">
                    Tempat Sampah Kosong
                  </h4>
                  <p className="text-sm text-[#3D2B1F]/40">
                    Pesanan yang Anda hapus akan muncul di sini.
                  </p>
                </div>
              ) : (
                orders
                  .filter((o) => o.isDeleted)
                  .map((order, idx) => (
                    <div
                      key={order.firebaseKey || `${order.id}-${idx}`}
                      className="bg-white p-6 rounded-[2rem] shadow-sm border border-[#3D2B1F]/5 flex flex-col gap-4 opacity-80"
                    >
                      <div className="flex items-center justify-between border-b border-[#3D2B1F]/5 pb-3">
                        <div>
                          <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                            NOTA PESANAN
                          </p>
                          <p className="text-lg font-bold text-[#3D2B1F]">
                            #{getSequentialOrderNumber(order, orders)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                            TANGGAL
                          </p>
                          <p className="text-xs font-bold text-[#3D2B1F]">
                            {order.timestamp.toLocaleDateString("id-ID")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start justify-between border-b border-[#3D2B1F]/5 pb-3">
                        <div>
                          <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                            PELANGGAN
                          </p>
                          <p className="font-bold text-[#3D2B1F]">
                            {order.customerName}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                            TOTAL
                          </p>
                          <p className="font-bold text-[#3D2B1F]">
                            Rp {order.total.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={() =>
                            onRestoreOrder(order.firebaseKey || order.id)
                          }
                          className="flex-1 bg-green-600 text-white text-xs font-bold py-3.5 rounded-xl shadow-md hover:bg-green-700 transition-all flex items-center justify-center gap-2"
                        >
                          <RefreshCw size={14} />
                          Pulihkan
                        </button>
                        {deletingOrderId === (order.firebaseKey || order.id) ? (
                          <div className="flex-1 flex gap-1.5">
                            <button
                              onClick={() => {
                                onPermanentDelete(order.firebaseKey || order.id);
                                setDeletingOrderId(null);
                              }}
                              className="flex-1 bg-red-600 text-white text-[11px] font-black py-3.5 rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-1 shadow-md"
                            >
                              Ya, Lah!
                            </button>
                            <button
                              onClick={() => setDeletingOrderId(null)}
                              className="px-3 bg-gray-100 text-[#3D2B1F] text-xs font-bold py-3.5 rounded-xl hover:bg-gray-200 transition-all active:scale-95"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingOrderId(order.firebaseKey || order.id)}
                            className="flex-1 bg-red-50 text-red-600 text-xs font-bold py-3.5 rounded-xl border border-red-100 hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                          >
                            <Trash2 size={14} />
                            Hapus Permanen
                          </button>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
        {activeTab === "pengaturan" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setActiveTab("beranda")}
                className="h-8 w-8 flex items-center justify-center rounded-full bg-white border border-[#3D2B1F]/5 shadow-sm"
              >
                <ArrowLeft size={16} />
              </button>
              <h2 className="text-xl font-bold text-[#3D2B1F]">Profile</h2>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#3D2B1F]/5">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-16 w-16 rounded-full bg-[#D4AF37] flex items-center justify-center text-white text-2xl font-bold overflow-hidden">
                  {currentUser?.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      className="w-full h-full object-cover"
                      alt="Owner"
                      referrerPolicy="no-referrer"
                    />
                  ) : currentUser?.displayName || customerName ? (
                    (currentUser?.displayName || customerName)
                      .charAt(0)
                      .toUpperCase()
                  ) : (
                    "O"
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-[#3D2B1F]">
                    {currentUser?.displayName ||
                      customerName ||
                      "Owner Account"}
                  </h3>
                  <p className="text-xs text-[#3D2B1F]/60">
                    {currentUser?.email || customerEmail || OWNER_EMAILS[0]}
                  </p>
                  <div className="flex items-center gap-1 mt-1 text-green-600 bg-green-50 px-2 py-0.5 rounded-full w-fit">
                    <CheckCircle size={10} />
                    <span className="text-[9px] font-bold">
                      Terhubung & Sinkronisasi Otomatis
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <button
                  onClick={onSwitchToCustomer}
                  className="w-full py-4 rounded-xl bg-[#3D2B1F]/5 text-[#3D2B1F] font-bold flex items-center justify-center gap-2 hover:bg-[#3D2B1F]/10 transition-colors"
                >
                  <Utensils size={20} /> Mode Pelanggan
                </button>
                <button
                  onClick={() => {
                    setIsResettingData(true);
                  }}
                  className="w-full py-4 rounded-xl bg-red-50 text-red-600 font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-colors cursor-pointer"
                >
                  <Trash2 size={20} /> Reset Semua Data
                </button>
              </div>

              <button
                onClick={onLogout}
                className="w-full py-4 rounded-xl bg-red-50 text-red-600 font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
              >
                <LogOut size={20} /> Keluar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="bg-white h-20 border-t border-[#3D2B1F]/5 flex items-center justify-around px-6">
        <button
          onClick={() => setActiveTab("beranda")}
          className={`flex flex-col items-center gap-1 ${activeTab === "beranda" ? "text-[#3D2B1F]" : "text-[#3D2B1F]/30"}`}
        >
          <Home size={20} />
          <span className="text-[9px] font-bold">Beranda</span>
        </button>
        <button
          onClick={() => setActiveTab("laporan")}
          className={`flex flex-col items-center gap-1 ${activeTab === "laporan" ? "text-[#3D2B1F]" : "text-[#3D2B1F]/30"}`}
        >
          <BarChart3 size={20} />
          <span className="text-[9px] font-bold">Laporan</span>
        </button>
        <button
          onClick={() => setActiveTab("stok")}
          className={`flex flex-col items-center gap-1 ${activeTab === "stok" ? "text-[#3D2B1F]" : "text-[#3D2B1F]/30"}`}
        >
          <ReceiptText size={20} />
          <span className="text-[9px] font-bold">Stok</span>
        </button>
        <button
          onClick={() => setActiveTab("rating")}
          className={`flex flex-col items-center gap-1 ${activeTab === "rating" ? "text-[#3D2B1F]" : "text-[#3D2B1F]/30"}`}
        >
          <Star size={20} />
          <span className="text-[9px] font-bold">Rating</span>
        </button>
        <button
          onClick={() => setActiveTab("kuesioner")}
          className={`flex flex-col items-center gap-1 ${activeTab === "kuesioner" ? "text-[#3D2B1F]" : "text-[#3D2B1F]/30"}`}
        >
          <ClipboardList size={20} />
          <span className="text-[9px] font-bold">Kuesioner</span>
        </button>
        <button
          onClick={() => setActiveTab("pengaturan")}
          className={`flex flex-col items-center gap-1 ${activeTab === "pengaturan" ? "text-[#3D2B1F]" : "text-[#3D2B1F]/30"}`}
        >
          <User size={20} />
          <span className="text-[9px] font-bold">Profile</span>
        </button>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {/* Modal Edit Transaksi */}
        {editingSalesOrder && (
          <div
            key="edit-sales-order-modal"
            className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingSalesOrder(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2rem] p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center pb-4 border-b border-[#3D2B1F]/5 mb-4">
                <h3 className="text-xl font-bold text-[#3D2B1F]">
                  Detail & Pembatalan Transaksi
                </h3>
                <button 
                  onClick={() => setEditingSalesOrder(null)} 
                  className="text-[#3D2B1F]/40 hover:text-[#3D2B1F] p-1 rounded-full hover:bg-stone-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-[#3D2B1F]/5 p-4 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center border-b border-[#3D2B1F]/10 pb-2">
                    <span className="text-xs font-bold text-[#3D2B1F]/50">NO. NOTA</span>
                    <span className="text-sm font-bold text-[#3D2B1F]">#{getSequentialOrderNumber(editingSalesOrder, orders)}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[#3D2B1F]/10 pb-2">
                    <span className="text-xs font-bold text-[#3D2B1F]/50">NAMA PELANGGAN</span>
                    <span className="text-sm font-bold text-[#3D2B1F]">{editingSalesOrder.customerName || "Pelanggan"}</span>
                  </div>
                  {editingSalesOrder.customerPhone && (
                    <div className="flex justify-between items-center border-b border-[#3D2B1F]/10 pb-2">
                      <span className="text-xs font-bold text-[#3D2B1F]/50">NO. WHATSAPP</span>
                      <span className="text-xs font-bold text-[#3D2B1F]">{editingSalesOrder.customerPhone}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center border-b border-[#3D2B1F]/10 pb-2">
                    <span className="text-xs font-bold text-[#3D2B1F]/50">METODE BAYAR</span>
                    <span className="text-sm font-bold text-[#3D2B1F]">{editingSalesOrder.paymentMethod || "TUNAI"}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[#3D2B1F]/10 pb-2">
                    <span className="text-xs font-bold text-[#3D2B1F]/50">STATUS PESANAN</span>
                    <span className="text-sm font-bold capitalize text-[#3D2B1F]">{editingSalesOrder.status}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-[#3D2B1F]/50">TOTAL TRANSAKSI</span>
                    <span className="text-sm font-black text-[#D4AF37]">Rp {(editingSalesOrder.total || 0).toLocaleString()}</span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest block mb-2 font-black">Item Pesanan</span>
                  <div className="bg-white border border-[#3D2B1F]/5 p-4 rounded-2xl max-h-40 overflow-y-auto space-y-2">
                    {(editingSalesOrder.items || []).map((cartItem: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-start text-xs border-b border-dashed border-[#3D2B1F]/5 pb-2 last:border-b-0 last:pb-0">
                        <div>
                          <p className="font-bold text-[#3D2B1F] capitalize">{cartItem.item.name} x {cartItem.quantity}</p>
                          {cartItem.toppings && cartItem.toppings.length > 0 && (
                            <p className="text-[10px] text-[#3D2B1F]/60">+{cartItem.toppings.join(", ")}</p>
                          )}
                        </div>
                        <span className="font-black text-[#3D2B1F]">Rp {(cartItem.totalPrice || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest block mb-1.5 font-black">
                    CATATAN TRANSAKSI (EDITABLE)
                  </label>
                  <textarea
                    value={editingSalesOrder.notes || ""}
                    onChange={(e) =>
                      setEditingSalesOrder({
                        ...editingSalesOrder,
                        notes: e.target.value,
                      })
                    }
                    className="w-full bg-[#3D2B1F]/5 border border-[#3D2B1F]/10 rounded-2xl px-4 py-3 text-xs font-bold text-[#3D2B1F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 placeholder-[#3D2B1F]/20 resize-none h-20"
                    placeholder="Tambahkan atau edit catatan khusus transaksi di sini..."
                  />
                </div>

                {editingSalesOrder.status === "dibatalkan" ? (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-center text-red-600 text-xs font-bold">
                    Transaksi ini sudah dalam status dibatalkan.
                  </div>
                ) : (
                  <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl text-orange-700 text-xs font-bold">
                    Klik "Batalkan Transaksi" untuk memproses pembatalan. Tindakan ini akan mengubah status transaksi menjadi dibatalkan serta otomatis mengurangi omzet dan profit Anda.
                  </div>
                )}

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setEditingSalesOrder(null)}
                    className="px-4 py-3 rounded-xl font-bold text-sm text-[#3D2B1F]/60 hover:bg-[#3D2B1F]/5 transition-colors"
                  >
                    Tutup
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onEditOrder(editingSalesOrder.id, {
                        ...editingSalesOrder,
                      });
                      setEditingSalesOrder(null);
                    }}
                    className="flex-1 py-3 rounded-xl font-bold text-sm bg-[#3D2B1F] text-white hover:bg-black transition-colors active:scale-95 transition-all text-center"
                  >
                    Simpan Catatan
                  </button>
                  {editingSalesOrder.status !== "dibatalkan" && (
                    <button
                      type="button"
                      onClick={() => {
                        onEditOrder(editingSalesOrder.id, {
                          ...editingSalesOrder,
                          status: "dibatalkan",
                        });
                        setEditingSalesOrder(null);
                      }}
                      className="flex-1 py-3 rounded-xl font-bold text-sm bg-red-600 text-white hover:bg-red-700 transition-colors active:scale-95 transition-all text-center"
                    >
                      Batalkan Transaksi
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isEditNominalModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditNominalModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] p-6 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-[#3D2B1F] mb-4">
                Edit Nominal (
                {editNominalTarget === "hari"
                  ? "Hari Ini"
                  : editNominalTarget === "minggu"
                    ? "Minggu Ini"
                    : editNominalTarget === "bulan"
                      ? "Bulan Ini"
                      : "Semua"}
                )
              </h3>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-[#3D2B1F]/60 mb-1">
                    Total Omzet (Rp)
                  </label>
                  <input
                    type="number"
                    value={editNominalOmzet}
                    onChange={(e) => setEditNominalOmzet(e.target.value)}
                    className="w-full bg-[#F5F2EA] rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#3D2B1F]/60 mb-1">
                    Total Profit (Rp)
                  </label>
                  <input
                    type="number"
                    value={editNominalProfit}
                    onChange={(e) => setEditNominalProfit(e.target.value)}
                    className="w-full bg-[#F5F2EA] rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsEditNominalModalOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveEditNominal}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-[#3D2B1F] text-white hover:bg-black transition-colors"
                >
                  Simpan
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal Tambah Penjualan Manual */}
        {isManualOrderModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManualOrderModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2rem] p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <h3 className="text-xl font-bold text-[#3D2B1F] mb-4">
                Tambah Penjualan Manual
              </h3>
              {manualOrderError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-bold">
                  {manualOrderError}
                </div>
              )}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#3D2B1F]/60 uppercase tracking-widest mb-1">
                      Nama Pelanggan
                    </label>
                    <input
                      type="text"
                      value={manualOrderCustomerName}
                      onChange={(e) =>
                        setManualOrderCustomerName(e.target.value)
                      }
                      placeholder="Nama"
                      className="w-full bg-[#3D2B1F]/5 rounded-xl px-4 py-2 text-sm font-bold text-[#3D2B1F] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#3D2B1F]/60 uppercase tracking-widest mb-1">
                      No. WhatsApp
                    </label>
                    <input
                      type="text"
                      value={manualOrderCustomerPhone}
                      onChange={(e) =>
                        setManualOrderCustomerPhone(e.target.value)
                      }
                      placeholder="08..."
                      className="w-full bg-[#3D2B1F]/5 rounded-xl px-4 py-2 text-sm font-bold text-[#3D2B1F] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#3D2B1F]/60 uppercase tracking-widest mb-1">
                      Tanggal & Waktu
                    </label>
                    <input
                      type="datetime-local"
                      value={manualOrderDate}
                      onChange={(e) => setManualOrderDate(e.target.value)}
                      className="w-full bg-[#3D2B1F]/5 rounded-xl px-4 py-2 text-xs font-bold text-[#3D2B1F] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#3D2B1F]/60 uppercase tracking-widest mb-1">
                      Metode Bayar
                    </label>
                    <select
                      value={manualOrderPaymentMethod}
                      onChange={(e) =>
                        setManualOrderPaymentMethod(e.target.value as any)
                      }
                      className="w-full bg-[#3D2B1F]/5 rounded-xl px-4 py-2 text-sm font-bold text-[#3D2B1F] focus:outline-none"
                    >
                      <option value="Tunai">Tunai</option>
                      <option value="Transfer">Transfer</option>
                      <option value="QRIS">QRIS</option>
                    </select>
                  </div>
                </div>

                <div className="p-4 bg-[#3D2B1F]/5 rounded-2xl">
                  <label className="block text-[10px] font-bold text-[#3D2B1F]/60 uppercase tracking-widest mb-2">
                    Tambah Menu
                  </label>
                  <div className="flex gap-2 mb-3">
                    <select
                      value={manualOrderSelectedItemId || ""}
                      onChange={(e) => {
                        setManualOrderSelectedItemId(
                          e.target.value ? parseInt(e.target.value) : null,
                        );
                        setManualOrderSelectedToppings([]);
                      }}
                      className="flex-1 bg-white rounded-xl px-3 py-2 text-xs font-bold text-[#3D2B1F] focus:outline-none"
                    >
                      <option value="">Pilih Menu...</option>
                      {ALL_MENU_ITEMS.map((item) => {
                        const displayName =
                          item.name === "Add on" ? "Add on" : item.name;
                        const displayPrice = item.price.startsWith("Rp")
                          ? item.price
                          : `Rp ${item.price}`;
                        return (
                          <option key={item.id} value={item.id}>
                            {displayName} - {displayPrice}
                          </option>
                        );
                      })}
                    </select>
                    <input
                      type="number"
                      value={manualOrderItemQuantity}
                      onChange={(e) =>
                        setManualOrderItemQuantity(
                          e.target.value === ""
                            ? ""
                            : parseInt(e.target.value) || 0,
                        )
                      }
                      className="w-16 bg-white rounded-xl px-2 py-2 text-center text-xs font-bold text-[#3D2B1F] focus:outline-none"
                      min="1"
                    />
                    <button
                      onClick={addManualOrderItem}
                      className="bg-[#3D2B1F] text-white p-2 rounded-xl"
                    >
                      <Plus size={18} />
                    </button>
                  </div>

                  {manualOrderSelectedItemId && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-2">
                        Pilih Add-on:
                      </p>
                      <div className="flex flex-col gap-2">
                        {getToppingsForItem(
                          ALL_MENU_ITEMS.find(
                            (i) => i.id === manualOrderSelectedItemId,
                          )?.name || "",
                        ).map((topping) => {
                          const activePrice =
                            localToppingPrices[topping.name] !== undefined
                              ? localToppingPrices[topping.name]
                              : topping.defaultPrice;
                          const isSelected =
                            manualOrderSelectedToppings.includes(topping.name);
                          const quantity = manualOrderSelectedToppings.filter(
                            (t) => t === topping.name,
                          ).length;

                          return (
                            <div
                              key={topping.name}
                              className={`flex items-center justify-between rounded-xl p-2 border transition-all ${isSelected ? "border-[#3D2B1F]/30 bg-white shadow-sm" : "border-[#1C1C1E]/10 bg-[#F3F1ED]"}`}
                            >
                              <div className="flex flex-col ml-2">
                                <div className="flex items-center gap-1">
                                  <span
                                    className={`text-xs font-bold ${isSelected ? "text-[#3D2B1F]" : "text-[#3D2B1F]/60"}`}
                                  >
                                    {topping.name}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleEditToppingPrice(
                                        topping.name,
                                        activePrice,
                                      );
                                    }}
                                    className="text-[#3D2B1F]/40 hover:text-[#3D2B1F] p-3 -m-2 active:bg-black/5 rounded-full transition-colors"
                                    title={`Edit harga ${topping.name}`}
                                  >
                                    <Pencil size={14} />
                                  </button>
                                </div>
                                {activePrice > 0 && (
                                  <span className="text-[10px] text-[#3D2B1F]/50 font-semibold">
                                    +{`${activePrice.toLocaleString()}`}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 bg-[#F3F1ED] p-1 rounded-xl mr-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    let removed = false;
                                    setManualOrderSelectedToppings((prev) =>
                                      prev.filter((t) => {
                                        if (t === topping.name && !removed) {
                                          removed = true;
                                          return false;
                                        }
                                        return true;
                                      }),
                                    );
                                  }}
                                  className="w-7 h-7 flex items-center justify-center bg-white rounded-lg shadow-sm text-base font-bold text-[#3D2B1F] active:scale-95 transition-all"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  value={quantity === 0 ? "" : quantity}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    const validVal = isNaN(val)
                                      ? 0
                                      : Math.max(0, val);
                                    setManualOrderSelectedToppings((prev) => {
                                      const filtered = prev.filter(
                                        (t) => t !== topping.name,
                                      );
                                      const newToppings = Array(validVal).fill(
                                        topping.name,
                                      );
                                      return [...filtered, ...newToppings];
                                    });
                                  }}
                                  className="w-12 h-7 text-center font-bold text-[#3D2B1F] text-sm rounded-lg border border-transparent focus:border-[#D4AF37]/50 focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none bg-white shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  min="0"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setManualOrderSelectedToppings((prev) => [
                                      ...prev,
                                      topping.name,
                                    ])
                                  }
                                  className="w-7 h-7 flex items-center justify-center bg-[#3D2B1F] text-white rounded-lg shadow-sm text-base font-bold active:scale-95 transition-all"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {manualOrderItems.length > 0 && (
                    <div className="mt-3 space-y-2 max-h-40 overflow-y-auto pr-1 pb-1">
                      {manualOrderItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col bg-white p-3 rounded-lg text-[10px] shadow-sm border border-[#3D2B1F]/5"
                        >
                          <div className="flex items-start justify-between">
                            <p className="font-bold text-[#3D2B1F]">
                              {item.item.name} - {item.quantity}
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-[#3D2B1F] whitespace-nowrap">
                                Rp {(item.item.priceNum || 0).toLocaleString()}
                              </p>
                              <button
                                onClick={() => removeManualOrderItem(idx)}
                                className="text-red-500 hover:text-red-700 transition-colors bg-red-50 p-1 rounded-md"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                          {item.toppings && item.toppings.length > 0 && (
                            <ul className="mt-1.5 list-none space-y-1 ml-4 border-l-2 border-[#3D2B1F]/10 pl-2">
                              {item.toppings.map((tNameStr, tIdx) => {
                                const matchPrice = tNameStr.match(
                                  /^(.*?)(?:\s*\+Rp\s*(\d+))?$/,
                                );
                                const tName = matchPrice
                                  ? matchPrice[1].trim()
                                  : tNameStr;
                                const tPrice =
                                  matchPrice && matchPrice[2]
                                    ? parseInt(matchPrice[2])
                                    : (tName.toLowerCase() === "telur" || tName.toLowerCase() === "telur rebus")
                                      ? 4000
                                      : tName.toLowerCase() === "sosis"
                                        ? 1000
                                        : 0;

                                return (
                                  <li
                                    key={tIdx}
                                    className="text-[9px] text-[#3D2B1F]/60 flex items-center justify-between w-full"
                                  >
                                    <span className="italic">+{tName}</span>
                                    {tPrice > 0 && (
                                      <span className="whitespace-nowrap font-medium text-[#3D2B1F]">
                                        +Rp {tPrice.toLocaleString()}
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#3D2B1F]/5">
                            <p className="text-[#3D2B1F]/60 font-bold uppercase tracking-wider text-[8px]">
                              Sub-Total
                            </p>
                            <p className="font-black text-[#D4AF37] text-xs">
                              Rp {item.totalPrice.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#3D2B1F]/60 uppercase tracking-widest mb-1">
                      Total (Rp)
                    </label>
                    <input
                      type="number"
                      value={manualOrderTotal}
                      onChange={(e) => setManualOrderTotal(e.target.value)}
                      className="w-full bg-[#3D2B1F]/5 rounded-xl px-4 py-2 text-sm font-bold text-[#3D2B1F] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#3D2B1F]/60 uppercase tracking-widest mb-1">
                      Profit (Rp)
                    </label>
                    <input
                      type="number"
                      value={manualOrderProfit}
                      onChange={(e) => setManualOrderProfit(e.target.value)}
                      className="w-full bg-[#3D2B1F]/5 rounded-xl px-4 py-2 text-sm font-bold text-[#3D2B1F] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setIsManualOrderModalOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-[#3D2B1F]/60 hover:bg-[#3D2B1F]/5 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleAddManualOrder}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-[#3D2B1F] text-white hover:bg-black transition-colors"
                >
                  {isSubmittingManualOrder
                    ? "Menyimpan..."
                    : "Simpan Penjualan"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {orderToDelete && (
          <div
            key="delete-order-modal"
            className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOrderToDelete(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl"
            >
              <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-center text-[#3D2B1F] mb-2">
                Hapus Pesanan?
              </h3>
              <p className="text-center text-[#3D2B1F]/60 text-sm mb-6">
                Pesanan ini akan dihapus secara permanen dan tidak dapat
                dikembalikan.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setOrderToDelete(null)}
                  className="flex-1 py-3.5 rounded-xl font-bold text-[#3D2B1F] bg-stone-100 hover:bg-stone-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={() => {
                    if (orderToDelete) {
                      onDeleteOrder(orderToDelete);
                    }
                    setOrderToDelete(null);
                  }}
                  className="flex-1 py-3.5 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
                >
                  Hapus
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {feedbackToDelete && (
          <div
            key="delete-feedback-modal"
            className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFeedbackToDelete(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl"
            >
              <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-center text-[#3D2B1F] mb-2">
                Hapus feedback ini?
              </h3>
              <p className="text-center text-[#3D2B1F]/60 text-sm mb-6">
                Feedback ini akan dihapus secara permanen dan tidak dapat
                dikembalikan.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setFeedbackToDelete(null)}
                  className="flex-1 py-3.5 rounded-xl font-bold text-[#3D2B1F] bg-stone-100 hover:bg-stone-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleDeleteFeedback}
                  className="flex-1 py-3.5 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
                >
                  Hapus
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isResettingData && (
          <div
            key="reset-data-modal"
            className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsResettingData(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl"
            >
              <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-center text-[#3D2B1F] mb-2">
                Reset Semua Data?
              </h3>
              <p className="text-center text-[#3D2B1F]/60 text-sm mb-6">
                Tindakan ini akan menghapus semua data pesanan dari database.
                Apakah Anda yakin?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsResettingData(false)}
                  className="flex-1 py-3.5 rounded-xl font-bold text-[#3D2B1F] bg-stone-100 hover:bg-stone-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  disabled={isPerformingReset}
                  onClick={async () => {
                    try {
                      setIsPerformingReset(true);
                      if (isFirebaseConfigured) {
                        // Reset Orders from Firestore
                        const ordersRef = collection(db, "orders");
                        const snapshot = await getDocs(ordersRef);

                        if (!snapshot.empty) {
                          // Firestore batch limit is 500 operations
                          const docs = snapshot.docs;
                          for (let i = 0; i < docs.length; i += 500) {
                            const batch = writeBatch(db);
                            const chunk = docs.slice(i, i + 500);
                            chunk.forEach((docSnap) => {
                              batch.delete(docSnap.ref);
                            });
                            await batch.commit();
                          }
                        }

                        // Also reset feedbacks
                        const feedbacksRef = collection(db, "app_feedback");
                        const fSnapshot = await getDocs(feedbacksRef);
                        if (!fSnapshot.empty) {
                          const fDocs = fSnapshot.docs;
                          for (let i = 0; i < fDocs.length; i += 500) {
                            const batch = writeBatch(db);
                            const chunk = fDocs.slice(i, i + 500);
                            chunk.forEach((docSnap) => {
                              batch.delete(docSnap.ref);
                            });
                            await batch.commit();
                          }
                        }
                      }

                      // Clear local storage
                      localStorage.removeItem("app_orders");
                      localStorage.removeItem("app_feedbacks");
                      localStorage.removeItem("app_notified_orders");

                      // Update local state
                      setOrders([]);
                      setFeedbacks([]);

                      showNotification("Semua data berhasil direset.");
                      setIsResettingData(false);
                    } catch (err: any) {
                      console.error("Error resetting data:", err);
                      // Use the required error handling pattern
                      try {
                        handleFirestoreError(
                          err,
                          OperationType.DELETE,
                          "orders/feedbacks",
                        );
                      } catch (e) {
                        // If handleFirestoreError throws, we still want to show a notification
                      }
                      showNotification(
                        "Gagal mereset data: " + (err.message || "Error"),
                      );
                    } finally {
                      setIsPerformingReset(false);
                    }
                  }}
                  className={`flex-1 py-3.5 rounded-xl font-bold text-white transition-colors ${isPerformingReset ? "bg-red-300 cursor-not-allowed" : "bg-red-500 hover:bg-red-600"}`}
                >
                  {isPerformingReset ? "Mereset..." : "Ya, Reset"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isMassDeleteModalOpen && (
          <div
            key="mass-delete-modal"
            className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMassDeleteModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl"
            >
              <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-center text-[#3D2B1F] mb-2">
                Hapus Seluruh Data?
              </h3>
              <p className="text-center text-[#3D2B1F]/60 text-sm mb-6">
                Apakah Anda yakin ingin menghapus seluruh data pada{" "}
                {reportFilterType === "hari"
                  ? `tanggal ${parseDateString(reportFilterDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`
                  : reportFilterType === "minggu"
                    ? "Minggu Ini"
                    : reportFilterType === "bulan"
                      ? `bulan ${parseDateString(reportFilterDate).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}`
                      : "Semua Waktu"}
                ?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsMassDeleteModalOpen(false)}
                  className="flex-1 py-3.5 rounded-xl font-bold text-[#3D2B1F] bg-stone-100 hover:bg-stone-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  disabled={isPerformingReset}
                  onClick={async () => {
                    try {
                      setIsPerformingReset(true);
                      const ordersToDelete = filteredReportData.riwayatOrders;
                      const idsToDelete = ordersToDelete.map((o) => o.id);

                      if (isFirebaseConfigured) {
                        const batchSize = 400; // max 500 but keep safe margin
                        for (
                          let i = 0;
                          i < ordersToDelete.length;
                          i += batchSize
                        ) {
                          const chunk = ordersToDelete.slice(i, i + batchSize);
                          const deleteBatch = writeBatch(db);
                          chunk.forEach((order) => {
                            if (order.firebaseKey) {
                              const ref = doc(db, "orders", order.firebaseKey);
                              deleteBatch.delete(ref);
                            }
                          });
                          await deleteBatch.commit();
                        }
                      }

                      // Update local state immediately for both modes
                      const updatedOrders = orders.filter(
                        (o) => !idsToDelete.includes(o.id),
                      );
                      setOrders(updatedOrders);
                      localStorage.setItem(
                        "app_orders",
                        JSON.stringify(updatedOrders),
                      );

                      setIsMassDeleteModalOpen(false);
                      setIsPerformingReset(false);
                      showNotification(
                        `Berhasil menghapus ${ordersToDelete.length} data.`,
                      );
                    } catch (e) {
                      console.error("Mass delete error:", e);
                      showNotification("Gagal menghapus data massal.");
                      setIsPerformingReset(false);
                    }
                  }}
                  className="flex-1 py-3.5 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
                >
                  {isPerformingReset ? "Menghapus..." : "Ya, Hapus"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isAddItemModalOpen && (
          <div
            key="add-item-modal"
            className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddItemModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <h3 className="text-xl font-bold text-[#3D2B1F] mb-4">
                Tambah Bahan Baru
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-[#3D2B1F]/60 uppercase tracking-widest mb-1">
                    Nama Bahan
                  </label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) =>
                      setNewItem({ ...newItem, name: e.target.value })
                    }
                    placeholder="Contoh: Indomie Goreng"
                    className="w-full bg-[#F5F2EA] rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#3D2B1F]/60 uppercase tracking-widest mb-1">
                      Stok Awal
                    </label>
                    <input
                      type="number"
                      value={newItem.stock}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          stock: Number(e.target.value),
                        })
                      }
                      className="w-full bg-[#F5F2EA] rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#3D2B1F]/60 uppercase tracking-widest mb-1">
                      Satuan
                    </label>
                    <input
                      type="text"
                      value={newItem.unit}
                      onChange={(e) =>
                        setNewItem({ ...newItem, unit: e.target.value })
                      }
                      placeholder="bks, biji, ltr, dll"
                      className="w-full bg-[#F5F2EA] rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#3D2B1F]/60 uppercase tracking-widest mb-1">
                      Stok Minimal
                    </label>
                    <input
                      type="number"
                      value={newItem.min}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          min: Number(e.target.value),
                        })
                      }
                      className="w-full bg-[#F5F2EA] rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#3D2B1F]/60 uppercase tracking-widest mb-1">
                      Stok Maksimal
                    </label>
                    <input
                      type="number"
                      value={newItem.max}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          max: Number(e.target.value),
                        })
                      }
                      className="w-full bg-[#F5F2EA] rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#3D2B1F]/60 uppercase tracking-widest mb-1">
                    URL Gambar (Opsional)
                  </label>
                  <input
                    type="text"
                    value={newItem.imageUrl}
                    onChange={(e) =>
                      setNewItem({ ...newItem, imageUrl: e.target.value })
                    }
                    placeholder="https://..."
                    className="w-full bg-[#F5F2EA] rounded-xl px-4 py-3 text-sm font-bold text-[#3D2B1F] outline-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsAddItemModalOpen(false)}
                    className="flex-1 py-4 rounded-2xl font-bold text-[#3D2B1F] bg-[#3D2B1F]/5 hover:bg-[#3D2B1F]/10 transition-all"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleAddItem}
                    disabled={!newItem.name}
                    className="flex-1 py-4 rounded-2xl font-bold text-white bg-[#3D2B1F] hover:bg-black transition-all disabled:opacity-50"
                  >
                    Tambah Bahan
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OrderHistoryCard({
  order,
  orderNum,
  onRateOrder,
  onDeleteOrder,
}: {
  key?: string | number;
  order: Order;
  orderNum?: string;
  onRateOrder?: (orderId: string, rating: number, feedback: string) => void;
  onDeleteOrder?: (orderId: string | string[]) => void;
}) {
  const [rating, setRating] = useState(order.rating || 0);
  const [feedback, setFeedback] = useState(order.feedback || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (order.rating) setRating(order.rating);
    if (order.feedback) setFeedback(order.feedback);
  }, [order.rating, order.feedback]);

  const handleSubmit = () => {
    if (rating > 0 && onRateOrder) {
      setIsSubmitting(true);
      onRateOrder(order.id, rating, feedback);
      setTimeout(() => setIsSubmitting(false), 500);
    }
  };

  return (
    <div className="bg-white p-4 rounded-[2rem] border border-[#3D2B1F]/5 shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-[#3D2B1F]/60">
            #{orderNum || String(1).padStart(2, "0")}
          </span>
          <span
            className={`text-[10px] font-bold uppercase ${order.status === "selesai" ? "text-green-500" : order.status === "dibatalkan" ? "text-red-500" : "text-orange-500"}`}
          >
            {order.status}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-[#3D2B1F]">
            {new Date(order.timestamp).toLocaleDateString()}
          </span>
          {onDeleteOrder && (
            <button
              onClick={() => onDeleteOrder(order.firebaseKey || order.id)}
              className="h-6 w-6 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full transition-colors"
              title="Hapus Riwayat"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="space-y-4 mb-4">
        <div className="bg-[#F3F1ED] p-5 rounded-[2rem] border border-[#3D2B1F]/5">
          <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-[0.2em] mb-4">
            MENU PESANAN
          </p>
          {(() => {
            const grouped = getGroupedItems(order.items);
            const allItems: Record<string, number> = {};

            grouped.forEach((gi) => {
              let name = gi.item.name.toLowerCase();
              name = name.split("+ rp")[0].split("+rp")[0].trim();
              allItems[name] = (allItems[name] || 0) + gi.quantity;

              const toppingsSource = gi.accumulatedToppings || gi.toppings;
              if (toppingsSource && toppingsSource.length > 0) {
                toppingsSource.forEach((t) => {
                  let tName = t.toLowerCase();
                  tName = tName.split("+ rp")[0].split("+rp")[0].trim();
                  allItems[tName] = (allItems[tName] || 0) + 1;
                });
              }
            });

            return (
              <div className="space-y-2">
                {Object.entries(allItems).map(([name, qty], idx) => (
                  <div key={idx} className="flex justify-between items-start">
                    <span className="text-sm text-[#3D2B1F] font-bold leading-tight flex-1 pr-4">
                      {name} - {qty}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
      <div className="mb-4">
        <div className="flex flex-col gap-3 pt-3">
          {order.isManual && order.customerName === "Dokumen Rekap" && (
            <span className="text-xs font-bold text-[#3D2B1F]/60">
              Upload Dokumen/Gambar Manual
            </span>
          )}
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#3D2B1F]/50">
              Total Pembayaran
            </span>
            <span className="text-sm font-black text-[#3D2B1F] tracking-tight">
              Rp {(order.total || 0).toLocaleString("id-ID")}
            </span>
          </div>
        </div>
      </div>

      {(order.attachmentUrl || order.fileUrl) && (
        <div className="mb-4 text-xs text-[#3D2B1F]/70">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Paperclip size={12} className="text-[#3D2B1F]/40" />
              <span className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                Lampiran
              </span>
            </div>
            {order.attachmentType === "image" &&
              (order.attachmentUrl || order.fileUrl) && (
                <div className="relative group w-32 h-32 rounded-2xl overflow-hidden border border-[#3D2B1F]/10 shadow-sm bg-stone-50">
                  <img
                    src={order.attachmentUrl || order.fileUrl}
                    alt="Attachment Preview"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
              )}
            <button
              onClick={() => {
                const a = document.createElement("a");
                a.href = (order.attachmentUrl || order.fileUrl) as string;
                a.download = order.attachmentName || "Lampiran";
                a.click();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-[#3D2B1F]/10 text-[#3D2B1F] rounded-xl hover:bg-stone-50 shadow-sm transition-all active:scale-95 w-max"
            >
              {order.attachmentType === "image" ? (
                <ImageIcon size={16} />
              ) : (
                <FileText size={16} />
              )}
              <span className="font-bold text-xs">
                Unduh {order.attachmentType === "image" ? "Gambar" : "Berkas"}
              </span>
            </button>
          </div>
        </div>
      )}

      {order.status === "selesai" && (
        <div className="mt-4 pt-4 border-t border-[#3D2B1F]/10">
          <p className="text-xs font-bold text-[#3D2B1F] mb-2">
            Penilaian Anda
          </p>
          <div className="flex items-center gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => !order.rating && setRating(star)}
                disabled={!!order.rating}
                className={`transition-colors ${star <= rating ? "text-yellow-400" : "text-gray-300"}`}
              >
                <Star
                  size={24}
                  fill={star <= rating ? "#FBBF24" : "none"}
                  className={
                    star <= rating ? "text-yellow-400" : "text-gray-300"
                  }
                />
              </button>
            ))}
          </div>
          {!order.rating ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Berikan kritik & saran Anda..."
                className="w-full h-20 bg-[#F5F2EA] rounded-xl p-3 text-xs border border-[#3D2B1F]/10 focus:outline-none focus:ring-1 focus:ring-[#3D2B1F] resize-none"
              />
              <button
                onClick={handleSubmit}
                disabled={rating === 0 || isSubmitting}
                className="bg-[#3D2B1F] text-white py-2 rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-50"
              >
                {isSubmitting ? "Mengirim..." : "Kirim Penilaian"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {order.feedback && (
                <div className="bg-[#F5F2EA] rounded-xl p-3 text-xs border border-[#3D2B1F]/10 italic text-[#3D2B1F]/70">
                  "{order.feedback}"
                </div>
              )}
              <button
                disabled
                className="bg-green-500 text-white py-2 rounded-xl text-xs font-bold uppercase tracking-wider opacity-80 flex items-center justify-center gap-2"
              >
                <Check size={14} /> Penilaian Terkirim
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HomeScreen({
  address,
  addresses,
  setAddresses,
  customerName,
  customerPhone,
  customerEmail,
  onCheckout,
  onSelectItem,
  hasActiveOrder,
  activeTab,
  setActiveTab,
  activeCategory,
  setActiveCategory,
  searchQuery,
  setSearchQuery,
  onAddressChange,
  onViewOrders,
  cart,
  onLogout,
  onLogin,
  onOwnerLogin,
  currentUser,
  userRole,
  onOpenOwnerDashboard,
  onUpdateProfile,
  orders,
  onBackToWelcome,
  onRemoveFromCart,
  onEditCartItem,
  onRateOrder,
  onDeleteOrder,
  ownerSubView,
  setOwnerSubView,
  feedbacks,
  isFirebaseConfigured,
  setUserRole,
  dismissedNotifs,
  onDismissNotif,
  isDemoMode,
  setIsDemoMode,
}: {
  address: string;
  addresses: any[];
  setAddresses: React.Dispatch<React.SetStateAction<any[]>>;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  onCheckout: () => void;
  onSelectItem: (item: any) => void;
  hasActiveOrder: boolean;
  activeTab: string;
  setActiveTab: (t: string) => void;
  activeCategory: string;
  setActiveCategory: (c: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onAddressChange: (addr: string) => void;
  onViewOrders?: () => void;
  cart?: CartItem[];
  onLogout?: () => void;
  onLogin?: () => void;
  onOwnerLogin?: () => void;
  currentUser?: any;
  userRole?: "guest" | "customer" | "owner";
  onOpenOwnerDashboard?: () => void;
  onUpdateProfile?: (name: string, phone: string, email: string) => void;
  orders: Order[];
  onBackToWelcome: () => void;
  onRemoveFromCart?: (index: number) => void;
  onEditCartItem?: (index: number, updatedItem: CartItem) => void;
  onRateOrder?: (orderId: string, rating: number, feedback: string) => void;
  onDeleteOrder?: (orderId: string | string[]) => void;
  ownerSubView: string | null;
  setOwnerSubView: (v: string | null) => void;
  feedbacks: AppFeedback[];
  isFirebaseConfigured: boolean;
  setUserRole: (role: "guest" | "customer" | "owner") => void;
  dismissedNotifs: string[];
  onDismissNotif: (id: string) => void;
  isDemoMode?: boolean;
  setIsDemoMode?: (val: boolean) => void;
}) {
  const [notification, setNotification] = useState<string | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [profileSubView, setProfileSubView] = useState<string | null>(() => {
    return localStorage.getItem("app_profileSubView") || null;
  });
  const [isProfileQrExpanded, setIsProfileQrExpanded] = useState(false);
  const [editingCartItemIndex, setEditingCartItemIndex] = useState<
    number | null
  >(null);
  const [headerClickCount, setHeaderClickCount] = useState(0);

  useEffect(() => {
    if (profileSubView) {
      localStorage.setItem("app_profileSubView", profileSubView);
    } else {
      localStorage.removeItem("app_profileSubView");
    }
  }, [profileSubView]);

  // Profile States
  const [userProfile, setUserProfile] = useState({
    name: customerName,
    email: customerEmail,
    phone: customerPhone,
    image: "",
    rating: 0,
    feedback: "",
  });

  useEffect(() => {
    setUserProfile((prev) => ({
      ...prev,
      name: customerName,
      email: customerEmail,
      phone: customerPhone,
    }));
  }, [customerName, customerEmail, customerPhone]);

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("TUNAI");
  const [notifSettings, setNotifSettings] = useState({
    promo: true,
    orders: true,
    newsletter: false,
  });
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [newAddressForm, setNewAddressForm] = useState({
    label: "",
    detail: "",
  });

  // Drag to scroll state
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  useEffect(() => {
    // Sync main address when prop changes
    setAddresses((prev) =>
      prev.map((addr) => (addr.isMain ? { ...addr, detail: address } : addr)),
    );
  }, [address]);

  useEffect(() => {
    setProfileSubView(null); // Reset subview when tab changes
  }, [activeTab]);

  function showNotification(msg: string) {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }

  const handleProfileClick = () => {
    setActiveTab("pengaturan");
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return "Selamat Pagi";
    if (hour >= 11 && hour < 15) return "Selamat Siang";
    if (hour >= 15 && hour < 18) return "Selamat Sore";
    return "Selamat Malam";
  };

  const menuItems = ALL_MENU_ITEMS;

  return (
    <motion.div
      key="home"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col h-full relative overflow-hidden bg-[#F5F2EA]"
    >
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 20 }}
            exit={{ opacity: 0, y: -20 }}
            className={`absolute top-12 left-6 right-6 z-[100] ${notification.toLowerCase().includes("gagal") ? "bg-red-500" : "bg-[#3D2B1F]"} text-white p-4 rounded-2xl shadow-2xl text-center text-sm font-bold`}
          >
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      {activeTab === "home" && (
        <div className="flex-1 overflow-y-auto pb-40">
          {/* Header */}
          <div className="px-6 pt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onBackToWelcome}
                className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#3D2B1F]/5 transition-colors"
              >
                <ArrowLeft size={20} className="text-[#3D2B1F]" />
              </button>
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-[#3D2B1F]/50">
                  {getGreeting()}
                </p>
                <h2 className="text-xl font-sans font-bold text-[#3D2B1F]">
                  {userProfile.name || "Pelanggan"}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsNotificationsOpen(true)}
                className="h-12 w-12 rounded-full bg-white flex items-center justify-center shadow-sm border border-[#3D2B1F]/5 relative"
              >
                <Bell size={20} />
                {orders.filter((o) => {
                  if (dismissedNotifs.includes(String(o.id))) return false;
                  // Only count CURRENT customer's orders in the customer dashboard
                  return (
                    (o.customerName === userProfile.name &&
                      userProfile.name !== "") ||
                    (currentUser && o.uid === currentUser.uid)
                  );
                }).length > 0 && (
                  <div className="absolute top-3 right-3 h-2 w-2 bg-red-500 rounded-full"></div>
                )}
              </button>
              <div
                className="h-12 w-12 rounded-full overflow-hidden border-2 border-white shadow-md cursor-pointer"
                onClick={() => setActiveTab("pengaturan")}
              >
                <img
                  src={
                    currentUser?.photoURL ||
                    userProfile.image ||
                    "https://picsum.photos/seed/user/100/100"
                  }
                  alt="Profile"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* Location Removed */}

          {/* Search Bar (Static in Home) */}
          <div className="px-6 mt-8">
            <h2 className="text-2xl font-sans font-bold text-[#3D2B1F]">
              Pilih menu sesukamu
            </h2>
          </div>

          {/* Categories */}
          <div className="mt-6">
            <div className="px-6 mb-3">
              <h3 className="text-xl font-bold text-[#3D2B1F]">Kategori</h3>
            </div>
            <div className="flex gap-4 overflow-x-auto px-6 pb-2 no-scrollbar">
              {[
                { name: "Mie", icon: <Utensils size={20} /> },
                { name: "Snack", icon: <Cookie size={20} /> },
              ].map((cat, i) => (
                <button
                  key={i}
                  onClick={() => setActiveCategory(cat.name)}
                  className="flex flex-col items-center gap-2 cursor-pointer"
                >
                  <div
                    className={`h-16 w-16 rounded-2xl flex items-center justify-center shadow-md transition-all ${activeCategory === cat.name ? "bg-[#3D2B1F] text-white" : "bg-white text-[#3D2B1F]"}`}
                  >
                    {cat.icon}
                  </div>
                  <span className="text-[10px] font-bold text-[#3D2B1F]">
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Menu Section */}
          <div className="mt-6 px-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-[#3D2B1F]">
                Menu {activeCategory}
              </h3>
            </div>
            <div className="space-y-6">
              {menuItems
                .filter((item) => item.categories.includes(activeCategory))
                .map((rest, i) => (
                  <div
                    key={i}
                    onClick={() => onSelectItem(rest)}
                    className="bg-white rounded-[2.5rem] overflow-hidden border border-[#3D2B1F]/5 shadow-sm cursor-pointer group"
                  >
                    <div className="h-64 w-full overflow-hidden bg-white">
                      <img
                        src={rest.img}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                        alt={rest.name}
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xl font-bold text-[#3D2B1F]">
                          {rest.name}
                        </h4>
                        <p className="font-bold text-[#3D2B1F]">{rest.price}</p>
                      </div>
                      <p className="text-sm text-[#3D2B1F]/60 mb-4 leading-relaxed">
                        {rest.description}
                      </p>
                      <div className="flex items-center gap-6 pt-4 border-t border-[#3D2B1F]/5">
                        <div className="flex items-center gap-2 text-xs font-bold text-[#3D2B1F]/70">
                          <Clock size={16} className="text-[#D4AF37]" />
                          <span>{rest.time}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold text-[#3D2B1F]/70">
                          <Bike size={16} className="text-[#D4AF37]" />
                          <span>{rest.delivery}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              {menuItems.filter((item) =>
                item.categories.includes(activeCategory),
              ).length === 0 && (
                <p className="text-center text-[#3D2B1F]/40 py-10">
                  Belum ada menu untuk kategori ini.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "search" && (
        <div className="px-6 pt-4 flex-1 flex flex-col overflow-y-auto pb-40">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => setActiveTab("home")}
              className="h-10 w-10 flex items-center justify-center rounded-full bg-white border border-[#3D2B1F]/5 shadow-sm"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 relative">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[#3D2B1F]/40"
                size={18}
              />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari menu favoritmu..."
                className="w-full h-12 bg-white rounded-2xl pl-12 pr-4 text-sm font-medium border border-[#3D2B1F]/5 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3D2B1F]/10"
              />
            </div>
          </div>

          <div className="space-y-6">
            {menuItems.filter(
              (item) =>
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.description
                  .toLowerCase()
                  .includes(searchQuery.toLowerCase()),
            ).length > 0 ? (
              menuItems
                .filter(
                  (item) =>
                    item.name
                      .toLowerCase()
                      .includes(searchQuery.toLowerCase()) ||
                    item.description
                      .toLowerCase()
                      .includes(searchQuery.toLowerCase()),
                )
                .map((rest, i) => (
                  <div
                    key={i}
                    onClick={() => onSelectItem(rest)}
                    className="bg-white rounded-[2.5rem] overflow-hidden border border-[#3D2B1F]/5 shadow-sm cursor-pointer group"
                  >
                    <div className="h-48 w-full overflow-hidden bg-white">
                      <img
                        src={rest.img}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                        alt={rest.name}
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-lg font-bold text-[#3D2B1F]">
                          {rest.name}
                        </h4>
                        <p className="font-bold text-[#3D2B1F] text-sm">
                          {rest.price}
                        </p>
                      </div>
                      <p className="text-xs text-[#3D2B1F]/60 leading-relaxed">
                        {rest.description}
                      </p>
                    </div>
                  </div>
                ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-20 w-20 rounded-full bg-[#3D2B1F]/5 flex items-center justify-center text-[#3D2B1F]/20 mb-4">
                  <Search size={40} />
                </div>
                <p className="text-[#3D2B1F]/60 font-bold">
                  Menu tidak ditemukan
                </p>
                <p className="text-xs text-[#3D2B1F]/40 mt-1">
                  Coba cari dengan kata kunci lain
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "riwayat" && (
        <div className="px-6 pt-4 flex-1 flex flex-col overflow-y-auto pb-40">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setActiveTab("home")}
                className="h-10 w-10 flex items-center justify-center rounded-full bg-white border border-[#3D2B1F]/5 shadow-sm"
              >
                <ArrowLeft size={20} />
              </button>
              <h2 className="text-3xl font-sans text-[#3D2B1F]">
                Riwayat Pesanan
              </h2>
            </div>
          </div>

          {orders.filter(
            (o) =>
              !o.isDeleted &&
              (o.customerName === customerName ||
                (currentUser && o.uid === currentUser.uid) ||
                (currentUser && o.customerEmail === currentUser.email)),
          ).length > 0 ? (
            <div className="space-y-4">
              {[
                ...orders.filter(
                  (o) =>
                    !o.isDeleted &&
                    (o.customerName === customerName ||
                      (currentUser && o.uid === currentUser.uid) ||
                      (currentUser && o.customerEmail === currentUser.email)),
                ),
              ]
                .sort((a, b) => {
                  const timeA =
                    a.timestamp instanceof Date
                      ? a.timestamp
                      : new Date(a.timestamp);
                  const timeB =
                    b.timestamp instanceof Date
                      ? b.timestamp
                      : new Date(b.timestamp);
                  const timeDiff = timeB.getTime() - timeA.getTime();
                  if (timeDiff !== 0) return timeDiff;
                  const aId = a.firebaseKey || a.id || "";
                  const bId = b.firebaseKey || b.id || "";
                  return bId.localeCompare(aId);
                })
                .map((order, idx, arr) => (
                  <OrderHistoryCard
                    key={
                      order.firebaseKey ||
                      `${order.id}-${order.sessionId || idx}`
                    }
                    order={order}
                    orderNum={String(arr.length - idx).padStart(2, "0")}
                    onRateOrder={onRateOrder}
                    onDeleteOrder={onDeleteOrder}
                  />
                ))}
            </div>
          ) : (
            <p className="text-center text-[#3D2B1F]/40 py-10">
              Belum ada riwayat pembelian.
            </p>
          )}
        </div>
      )}

      {activeTab === "cart" && (
        <div className="px-6 pt-4 flex-1 flex flex-col overflow-y-auto pb-40">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => setActiveTab("home")}
              className="h-10 w-10 flex items-center justify-center rounded-full bg-white border border-[#3D2B1F]/5 shadow-sm"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-3xl font-sans text-[#3D2B1F]">Keranjang</h2>
          </div>

          {cart && cart.length > 0 ? (
            <div className="space-y-6">
              {cart.map((cartItem, idx) => (
                <div
                  key={idx}
                  className="bg-white p-4 rounded-[2rem] flex gap-4 border border-[#3D2B1F]/5 shadow-sm"
                >
                  <div className="h-20 w-20 rounded-2xl overflow-hidden shrink-0">
                    <img
                      src={cartItem.item.img}
                      className="w-full h-full object-cover"
                      alt={cartItem.item.name}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-[#3D2B1F]">
                      {cartItem.item.name.toLowerCase()} - {cartItem.quantity}
                    </h4>
                    {cartItem.toppings && cartItem.toppings.length > 0 && (
                      <div className="mt-1">
                        <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest mb-0.5">
                          add on :
                        </p>
                        {Object.entries(
                          cartItem.toppings.reduce((acc: any, t: string) => {
                            acc[t] = (acc[t] || 0) + 1;
                            return acc;
                          }, {}),
                        ).map(([name, count]: [string, any]) => {
                          const isTelurGulung = cartItem.item.name
                            .toLowerCase()
                            .includes("telur gulung");
                          const isSaus =
                            name.toLowerCase().includes("saus") ||
                            name.toLowerCase().includes("sambal") ||
                            name.toLowerCase().includes("tomat");

                          if (isSaus) {
                            return (
                              <p
                                key={name}
                                className="text-[10px] font-bold text-[#3D2B1F] flex items-center gap-1"
                              >
                                {" "}
                                {name
                                  .split("+")[0]
                                  .split("Rp")[0]
                                  .trim()
                                  .toLowerCase()}{" "}
                              </p>
                            );
                          }

                          return (
                            <p
                              key={name}
                              className="text-[10px] font-bold text-[#3D2B1F] flex items-center gap-1"
                            >
                              {name
                                .split("+")[0]
                                .split("Rp")[0]
                                .trim()
                                .toLowerCase()}{" "}
                              - {count}
                            </p>
                          );
                        })}
                      </div>
                    )}
                    {cartItem.notes && (
                      <p className="text-[10px] text-[#3D2B1F]/40 italic mt-1">
                        Catatan: {cartItem.notes}
                      </p>
                    )}
                    <div className="mt-2 pt-2 border-t border-dashed border-[#3D2B1F]/20">
                      <p className="text-xs font-bold text-[#3D2B1F]">
                        Total Rp {cartItem.totalPrice.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => setEditingCartItemIndex(idx)}
                      className="h-8 w-8 flex items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => onRemoveFromCart && onRemoveFromCart(idx)}
                      className="h-8 w-8 flex items-center justify-center rounded-full text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}

              <div className="pt-4 border-t border-[#3D2B1F]/10 mt-4">
                <div className="flex justify-between items-center mb-6">
                  <span className="font-bold text-[#3D2B1F]">
                    Total Pembayaran
                  </span>
                  <span className="text-xl font-bold text-[#3D2B1F]">
                    Rp{" "}
                    {cart
                      .reduce((sum, item) => sum + item.totalPrice, 0)
                      .toLocaleString()}
                  </span>
                </div>
                <button
                  onClick={onCheckout}
                  className="w-full h-14 bg-[#3D2B1F] text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform"
                >
                  Lanjut Pembayaran
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
              <div className="h-24 w-24 rounded-full bg-[#3D2B1F]/5 flex items-center justify-center text-[#3D2B1F]/20 mb-4">
                <ShoppingBag size={48} />
              </div>
              <p className="text-[#3D2B1F]/60 font-bold">Keranjang Kosong</p>
              <p className="text-xs text-[#3D2B1F]/40 mt-1">
                Yuk, cari menu favoritmu!
              </p>
              <button
                onClick={() => setActiveTab("home")}
                className="mt-8 px-8 py-3 bg-[#3D2B1F] text-white rounded-xl font-bold text-sm"
              >
                Cari Menu
              </button>
            </div>
          )}

          <EditCartItemModal
            show={editingCartItemIndex !== null}
            cartItem={
              editingCartItemIndex !== null && cart
                ? cart[editingCartItemIndex]
                : null
            }
            onClose={() => setEditingCartItemIndex(null)}
            onSave={(updatedItem) => {
              if (editingCartItemIndex !== null && onEditCartItem) {
                onEditCartItem(editingCartItemIndex, updatedItem);
              }
            }}
          />
        </div>
      )}

      {activeTab === "pengaturan" && (
        <>
          <div className="px-6 pt-4 flex-1 flex flex-col overflow-y-auto pb-40">
            {!profileSubView ? (
              <>
                <div className="flex items-center gap-4 mb-8">
                  <button
                    onClick={() => setActiveTab("home")}
                    className="h-10 w-10 flex items-center justify-center rounded-full bg-white border border-[#3D2B1F]/5 shadow-sm"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <h2 className="text-3xl font-sans text-[#3D2B1F]">Profil</h2>
                </div>
                <div className="flex flex-col items-center mb-10">
                  <div className="relative group">
                    <div
                      className="h-32 w-32 rounded-full overflow-hidden border-4 border-white shadow-xl mb-4 cursor-pointer"
                      onClick={() =>
                        document.getElementById("profile-upload")?.click()
                      }
                    >
                      <img
                        src={
                          currentUser?.photoURL ||
                          userProfile.image ||
                          "https://picsum.photos/seed/user/200/200"
                        }
                        className="w-full h-full object-cover"
                        alt="Profile"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Sparkles size={24} className="text-white" />
                      </div>
                    </div>
                    <input
                      type="file"
                      id="profile-upload"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const imageUrl = URL.createObjectURL(file);
                          setUserProfile((prev) => ({
                            ...prev,
                            image: imageUrl,
                          }));
                          showNotification("Foto profil diperbarui!");
                        }
                      }}
                    />
                  </div>
                  <h3 className="text-xl font-bold text-[#3D2B1F]">
                    {currentUser?.displayName ||
                      userProfile.name ||
                      "Pelanggan"}
                  </h3>
                  <p className="text-sm text-[#3D2B1F]/50">
                    {currentUser?.email || userProfile.email}
                  </p>
                </div>
                <div className="space-y-4 pb-36">
                  {[
                    { name: "Pengaturan Akun", icon: <Settings size={20} /> },
                    {
                      name: "Alamat Pengantaran",
                      icon: <MapPin size={20} />,
                    },
                    {
                      name: "Metode Pembayaran",
                      icon: <CreditCard size={20} />,
                    },
                    { name: "Kuesioner", icon: <Star size={20} /> },
                    { name: "Pusat Bantuan", icon: <HelpCircle size={20} /> },
                    ...(isOwnerEmail(currentUser?.email) ||
                    isOwnerEmail(userProfile.email)
                      ? [{ name: "Akses Owner", icon: <Lock size={20} /> }]
                      : []),
                  ].map((item, i) => (
                    <motion.div
                      key={i}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        if (item.name === "Akses Owner") {
                          onOpenOwnerDashboard();
                        } else {
                          setProfileSubView(item.name);
                        }
                      }}
                      className="bg-white p-5 rounded-2xl flex items-center justify-between border border-[#3D2B1F]/5 shadow-sm cursor-pointer hover:bg-stone-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-[#3D2B1F]/40">{item.icon}</div>
                        <span className="font-bold text-[#3D2B1F] text-sm md:text-base">
                          {item.name}
                        </span>
                      </div>
                      <ChevronRight size={18} className="text-[#3D2B1F]/30" />
                    </motion.div>
                  ))}

                  {currentUser && (
                    <>
                      {isOwnerEmail(currentUser?.email) && (
                        <motion.button
                          whileTap={{ scale: 0.98 }}
                          onClick={onOpenOwnerDashboard}
                          className="w-full mt-4 p-5 rounded-2xl flex items-center justify-center gap-3 bg-[#D4AF37] text-white font-bold shadow-lg"
                        >
                          <LayoutDashboard size={20} />
                          Buka Dashboard Owner
                        </motion.button>
                      )}
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          showNotification("Anda telah keluar.");
                          if (onLogout) onLogout();
                        }}
                        className="w-full mt-4 p-5 rounded-2xl flex items-center justify-center gap-3 bg-red-50 text-red-600 font-bold border border-red-100"
                      >
                        <LogOut size={20} className="rotate-180" />
                        Keluar Akun
                      </motion.button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-4 mb-8">
                  <button
                    onClick={() => setProfileSubView(null)}
                    className="h-10 w-10 flex items-center justify-center rounded-full bg-white border border-[#3D2B1F]/5 shadow-sm"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <h2 className="text-2xl font-sans text-[#3D2B1F]">
                    {profileSubView}
                  </h2>
                </div>

                {profileSubView === "Pengaturan Akun" && (
                  <div className="space-y-6 pb-36">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#3D2B1F]/40 ml-2">
                        Nama Lengkap
                      </label>
                      <input
                        type="text"
                        value={userProfile.name || ""}
                        onChange={(e) =>
                          setUserProfile({
                            ...userProfile,
                            name: e.target.value,
                          })
                        }
                        className="w-full h-14 bg-white rounded-2xl px-6 text-sm font-medium border border-[#3D2B1F]/5 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3D2B1F]/10"
                        placeholder="Contoh: Budi Santoso"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#3D2B1F]/40 ml-2">
                        Nomor Telepon
                      </label>
                      <input
                        type="tel"
                        value={userProfile.phone || ""}
                        onChange={(e) =>
                          setUserProfile({
                            ...userProfile,
                            phone: e.target.value,
                          })
                        }
                        className="w-full h-14 bg-white rounded-2xl px-6 text-sm font-medium border border-[#3D2B1F]/5 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3D2B1F]/10"
                        placeholder="Contoh: 08123456789"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#3D2B1F]/40 ml-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={userProfile.email || ""}
                        onChange={async (e) => {
                          const newEmail = e.target.value;
                          setUserProfile({ ...userProfile, email: newEmail });
                          const lower = newEmail.toLowerCase();
                          if (setIsDemoMode) {
                            setIsDemoMode(false);
                          }

                          if (isOwnerEmail(newEmail)) {
                            setUserRole("owner");
                            showNotification("Akses Owner Diaktifkan");
                            if (isFirebaseConfigured) {
                              try {
                                let user = auth.currentUser;
                                if (!user) {
                                  const cred = await signInAnonymously(auth);
                                  user = cred.user;
                                }
                                await setDoc(
                                  doc(db, "owner_sessions", user.uid),
                                  {
                                    secret: "IndominiteSecret2026",
                                    timestamp: serverTimestamp(),
                                  },
                                );
                              } catch (err) {
                                console.error(
                                  "Failed to set owner session in Firebase:",
                                  err,
                                );
                                // We don't show error to user to keep it simple, it will just fallback to local mode
                              }
                            }
                          } else if (
                            userRole === "owner" &&
                            !isOwnerEmail(currentUser?.email)
                          ) {
                            setUserRole("customer");
                          }
                        }}
                        className="w-full h-14 bg-white rounded-2xl px-6 text-sm font-medium border border-[#3D2B1F]/5 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3D2B1F]/10"
                        placeholder="Contoh: budi@gmail.com"
                      />
                    </div>
                  </div>
                )}

                {profileSubView === "Metode Pembayaran" && (
                  <div className="space-y-4 pb-36">
                    <div
                      onClick={() => {
                        setSelectedPaymentMethod("QRIS");
                        showNotification("qris pembayaran");
                      }}
                      className={`p-5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${selectedPaymentMethod === "QRIS" ? "bg-[#3D2B1F] text-white border-[#3D2B1F] shadow-lg" : "bg-white text-[#3D2B1F] border-[#3D2B1F]/5 shadow-sm"}`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`h-12 w-12 rounded-xl flex items-center justify-center ${selectedPaymentMethod === "QRIS" ? "bg-white/10" : "bg-blue-50 text-blue-600"}`}
                        >
                          <QrCode size={24} />
                        </div>
                        <div>
                          <p className="font-bold">QRIS</p>
                          <p
                            className={`text-xs ${selectedPaymentMethod === "QRIS" ? "text-white/60" : "text-[#3D2B1F]/40"}`}
                          >
                            Scan & Bayar
                          </p>
                        </div>
                      </div>
                      {selectedPaymentMethod === "QRIS" ? (
                        <CheckCircle size={20} />
                      ) : (
                        <div className="text-[#D4AF37] text-xs font-bold">
                          PILIH
                        </div>
                      )}
                    </div>

                    {selectedPaymentMethod === "QRIS" && (
                      <div className="w-full p-6 bg-white rounded-3xl border border-[#3D2B1F]/10 flex flex-col items-center justify-center shadow-sm">
                        <p className="text-xs font-bold text-[#3D2B1F]/60 uppercase tracking-widest text-center mb-4">
                          Scan QRIS untuk Pembayaran
                        </p>
                        
                        <div 
                          onClick={() => setIsProfileQrExpanded(true)}
                          className="relative group cursor-pointer bg-white p-4 rounded-2xl border-2 border-[#3D2B1F]/5 shadow-inner hover:border-[#3D2B1F]/20 transition-all max-w-[200px]"
                        >
                          <img
                            src="https://raw.githubusercontent.com/Dinni-hub/QRIS-pembayaran/main/Screenshot%202026-04-22%20202242.png"
                            alt="QRIS Pembayaran Indomi Nite"
                            className="w-full h-auto rounded-lg object-contain"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-2xl flex items-center justify-center transition-opacity">
                            <span className="text-white text-xs font-bold px-3 py-1.5 bg-black/60 rounded-full flex items-center gap-1">
                              Perbesar
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] text-[#3D2B1F]/60 mt-3 font-semibold text-center leading-relaxed">
                          Silakan scan QRIS di atas untuk melakukan pembayaran otomatis. <br />
                          Klik gambar untuk memperbesar atau unduh pakai tombol di bawah.
                        </p>

                        <div className="flex gap-2 w-full mt-4">
                          <button
                            type="button"
                            onClick={() => setIsProfileQrExpanded(true)}
                            className="flex-1 bg-[#3D2B1F]/5 text-[#3D2B1F] py-2.5 rounded-xl text-xs font-bold hover:bg-[#3D2B1F]/10 transition-colors flex items-center justify-center gap-1"
                          >
                            Perbesar
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const response = await fetch(
                                  "https://raw.githubusercontent.com/Dinni-hub/QRIS-pembayaran/main/Screenshot%202026-04-22%20202242.png",
                                );
                                const blob = await response.blob();
                                const url = window.URL.createObjectURL(blob);
                                const link = document.createElement("a");
                                link.href = url;
                                link.download = "QRIS-Indomi-Nite.png";
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                window.URL.revokeObjectURL(url);
                              } catch (err) {
                                console.error("Gagal mengunduh QRIS:", err);
                                const link = document.createElement("a");
                                link.href =
                                  "https://raw.githubusercontent.com/Dinni-hub/QRIS-pembayaran/main/Screenshot%202026-04-22%20202242.png";
                                link.download = "QRIS-Indomi-Nite.png";
                                link.target = "_blank";
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }
                            }}
                            className="flex-1 bg-[#3D2B1F] text-white py-2.5 rounded-xl text-xs font-bold hover:bg-black transition-colors flex items-center justify-center gap-1"
                          >
                            <Download size={14} /> Unduh QRIS
                          </button>
                        </div>
                      </div>
                    )}

                    <div
                      onClick={() => setSelectedPaymentMethod("TUNAI")}
                      className={`p-5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${selectedPaymentMethod === "TUNAI" ? "bg-[#3D2B1F] text-white border-[#3D2B1F] shadow-lg" : "bg-white text-[#3D2B1F] border-[#3D2B1F]/5 shadow-sm"}`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`h-12 w-12 rounded-xl flex items-center justify-center ${selectedPaymentMethod === "TUNAI" ? "bg-white/10" : "bg-green-50 text-green-600"}`}
                        >
                          <Banknote size={24} />
                        </div>
                        <div>
                          <p className="font-bold">TUNAI</p>
                          <p
                            className={`text-xs ${selectedPaymentMethod === "TUNAI" ? "text-white/60" : "text-[#3D2B1F]/40"}`}
                          >
                            Bayar di Tempat
                          </p>
                        </div>
                      </div>
                      {selectedPaymentMethod === "TUNAI" ? (
                        <CheckCircle size={20} />
                      ) : (
                        <div className="text-[#D4AF37] text-xs font-bold">
                          PILIH
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {profileSubView === "Alamat Pengantaran" && (
                  <div className="space-y-6 pb-36">
                    <div className="bg-white p-6 rounded-3xl border border-[#3D2B1F]/5 shadow-sm">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#3D2B1F]/40 ml-2">
                            Lokasi Pengiriman (Area Kampus)
                          </label>
                          <textarea
                            placeholder="Contoh: depan gedung U, auditorium, ambil di stand indomi nite"
                            value={address}
                            onChange={(e) => onAddressChange(e.target.value)}
                            className="w-full h-32 bg-stone-50 rounded-2xl p-4 text-sm font-medium border border-[#3D2B1F]/5 focus:outline-none focus:ring-2 focus:ring-[#3D2B1F]/10 resize-none placeholder:text-[#3D2B1F]/30"
                          />
                          <p className="text-xs text-[#3D2B1F]/40 ml-2">
                            Masukkan detail lokasi Anda di area kampus agar
                            kurir mudah menemukan Anda.
                          </p>
                        </div>

                        <button
                          onClick={() => {
                            if (!address.trim()) {
                              showNotification("Mohon isi lokasi pengiriman.");
                              return;
                            }
                            showNotification("Lokasi pengiriman diperbarui!");
                            setProfileSubView(null);
                          }}
                          className="w-full h-14 bg-[#3D2B1F] text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform"
                        >
                          Simpan Lokasi
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {profileSubView === "Kuesioner" && (
                  <div className="space-y-6 pb-36">
                    <div className="bg-white p-6 rounded-3xl border border-[#3D2B1F]/5 shadow-sm">
                      <div className="space-y-4">
                        <KuesionerForm
                          onSubmit={async (data) => {
                            showNotification(
                              "Terima kasih, masukan Anda sangat berarti!",
                            );
                            if (isFirebaseConfigured) {
                              try {
                                await addDoc(collection(db, "app_feedback"), {
                                  type: "Kuesioner",
                                  comment: JSON.stringify(data),
                                  rating: 5,
                                  timestamp: serverTimestamp(),
                                  userEmail:
                                    currentUser?.email ||
                                    customerEmail ||
                                    "anon",
                                  userName:
                                    currentUser?.displayName ||
                                    customerName ||
                                    "Pelanggan",
                                });
                              } catch (e) {
                                console.warn("Failed to save Kuesioner", e);
                              }
                            }
                            setProfileSubView(null);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {profileSubView === "Pusat Bantuan" && (
                  <div className="space-y-4 pb-36">
                    <div className="bg-white p-6 rounded-3xl border border-[#3D2B1F]/5 shadow-sm text-center">
                      <div className="h-20 w-20 rounded-full bg-[#3D2B1F]/5 flex items-center justify-center text-[#3D2B1F] mx-auto mb-4">
                        <HelpCircle size={40} />
                      </div>
                      <h3 className="text-xl font-bold text-[#3D2B1F] mb-2">
                        Ada Kendala?
                      </h3>
                      <p className="text-sm text-[#3D2B1F]/60 mb-6">
                        Tim dukungan kami siap membantumu 24/7 untuk setiap
                        pesanan.
                      </p>
                      <a
                        href="https://wa.me/6285648695615"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full h-14 bg-[#3D2B1F] text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
                      >
                        <Phone size={18} /> Hubungi Kami
                      </a>
                    </div>
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#3D2B1F]/40 ml-2 mt-4">
                        Pertanyaan Populer
                      </p>
                      {[
                        {
                          q: "Cara membatalkan pesanan",
                          a: "Anda dapat membatalkan pesanan dalam waktu 1 menit setelah pemesanan dilakukan melalui tab Orders.",
                        },
                        {
                          q: "Metode pembayaran tersedia",
                          a: "Kami menerima pembayaran Tunai dan Qris saat pemesanan.",
                        },
                        {
                          q: "Area jangkauan pengiriman",
                          a: "Saat ini kami melayani pengiriman untuk area kampus dan sekitarnya dalam radius 500m.",
                        },
                      ].map((faq, i) => (
                        <div
                          key={i}
                          className="bg-white rounded-xl border border-[#3D2B1F]/5 overflow-hidden"
                        >
                          <div
                            onClick={() =>
                              setExpandedFaq(expandedFaq === i ? null : i)
                            }
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-stone-50 transition-colors"
                          >
                            <span className="text-sm font-bold text-[#3D2B1F]">
                              {faq.q}
                            </span>
                            <ChevronDown
                              size={16}
                              className={`text-[#3D2B1F]/30 transition-transform ${expandedFaq === i ? "rotate-180" : ""}`}
                            />
                          </div>
                          <AnimatePresence>
                            {expandedFaq === i && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="px-4 pb-4"
                              >
                                <p className="text-xs text-[#3D2B1F]/60 leading-relaxed border-t border-[#3D2B1F]/5 pt-3">
                                  {faq.a}
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {profileSubView === "Pengaturan Akun" && (
            <div className="absolute bottom-28 left-6 right-6 z-30">
              <button
                onClick={() => {
                  if (onUpdateProfile) {
                    onUpdateProfile(
                      userProfile.name,
                      userProfile.phone,
                      userProfile.email,
                    );
                  }
                  showNotification("Profil berhasil diperbarui!");
                  setProfileSubView(null);
                }}
                className="w-full h-16 bg-[#3D2B1F] text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform"
              >
                Simpan Perubahan
              </button>
            </div>
          )}
        </>
      )}

      {/* Owner Dashboard Button */}

      {/* Bottom Nav */}
      <div className="absolute bottom-[-2px] left-0 right-0 w-full h-[98px] pb-[2px] bg-[#3D2B1F] flex items-center justify-between px-10 rounded-t-[3.5rem] shadow-2xl z-50">
        <button
          onClick={() => setActiveTab("home")}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === "home" ? "text-white" : "text-white/40"}`}
        >
          <Home size={24} />
          <span className="text-[10px] font-bold uppercase tracking-widest">
            Home
          </span>
        </button>
        <button
          onClick={() => setActiveTab("cart")}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === "cart" ? "text-white" : "text-white/40"}`}
        >
          <div className="relative">
            <ShoppingBag size={24} />
            {cart && cart.length > 0 && (
              <div className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-[#3D2B1F]"></div>
            )}
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest">
            Keranjang
          </span>
        </button>
        <button
          onClick={() => setActiveTab("riwayat")}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === "riwayat" ? "text-white" : "text-white/40"}`}
        >
          <div className="relative">
            <ReceiptText size={24} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest">
            Riwayat
          </span>
        </button>
        <button
          onClick={() => {
            if (onViewOrders) {
              onViewOrders();
            }
          }}
          className={`flex flex-col items-center gap-1 transition-colors text-white/40`}
        >
          <div className="relative">
            <ShoppingBag size={24} />
            {hasActiveOrder && (
              <div className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-[#3D2B1F]"></div>
            )}
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest">
            Pesanan
          </span>
        </button>
        <button
          onClick={handleProfileClick}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === "pengaturan" ? "text-white" : "text-white/40"}`}
        >
          <User size={24} />
          <span className="text-[10px] font-bold uppercase tracking-widest">
            Profile
          </span>
        </button>
      </div>

      {/* Notifications Modal */}
      <AnimatePresence>
        {isNotificationsOpen && (
          <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNotificationsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md bg-[#F5F2EA] rounded-t-[2rem] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 bg-white flex justify-between items-center border-b border-[#3D2B1F]/5">
                <h3 className="text-xl font-bold text-[#3D2B1F]">Notifikasi</h3>
                <button
                  onClick={() => setIsNotificationsOpen(false)}
                  className="h-8 w-8 bg-stone-100 rounded-full flex items-center justify-center text-[#3D2B1F]/60 hover:bg-stone-200"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                {/* Welcome Notification */}
                <div className="mb-4 p-4 bg-white rounded-2xl shadow-sm border border-[#3D2B1F]/5">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-orange-500 uppercase tracking-widest">
                      Sistem
                    </span>
                    <span className="text-[10px] text-[#3D2B1F]/40">
                      Baru saja
                    </span>
                  </div>
                  <p className="text-sm font-bold text-[#3D2B1F] mb-1">
                    Selamat datang di Indomi Nite!
                  </p>
                  <p className="text-xs text-[#3D2B1F]/60">
                    Nikmati menu spesial kami dan pantau status pesananmu di
                    sini.
                  </p>
                </div>

                {orders
                  .filter((o) => {
                    if (dismissedNotifs.includes(String(o.id))) return false;
                    // Strictly enforce customer-only view in the customer dashboard
                    return (
                      (o.customerName === customerName &&
                        customerName !== "") ||
                      (currentUser && o.uid === currentUser.uid)
                    );
                  })
                  .slice(0, 15)
                  .map((order) => {
                    let title = `Update Pesanan #${getSequentialOrderNumber(order, orders)}`;
                    let message = "";

                    switch (order.status) {
                      case "diterima":
                        message =
                          "Pesananmu sudah kami terima dan masuk antrean.";
                        break;
                      case "dimasak":
                        message =
                          "Koki kami sedang menyiapkan pesanan lezatmu.";
                        break;
                      case "diantar":
                        message =
                          "Pesananmu sedang dalam perjalanan menuju lokasimu.";
                        break;
                      case "selesai":
                        message =
                          "Pesanan selesai! Selamat menikmati hidangan kami.";
                        break;
                      case "dibatalkan":
                        message = "Maaf, pesananmu telah dibatalkan.";
                        break;
                      default:
                        message = `Status pesananmu saat ini adalah ${order.status}.`;
                    }

                    return (
                      <div
                        key={order.id}
                        className="mb-4 p-4 bg-white rounded-2xl shadow-sm border border-[#3D2B1F]/5 relative group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-[#3D2B1F]/60 uppercase tracking-widest">
                            {title}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[#3D2B1F]/40">
                              {order.timestamp instanceof Date
                                ? order.timestamp.toLocaleTimeString("id-ID", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Baru saja"}
                            </span>
                            <button
                              onClick={() => onDismissNotif(String(order.id))}
                              className="text-[#3D2B1F]/20 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-[#3D2B1F] mb-1 pr-6">
                          {message}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <div
                            className={`h-1.5 w-1.5 rounded-full ${order.status === "selesai" ? "bg-green-500" : "bg-orange-500 animate-pulse"}`}
                          ></div>
                          <p className="text-[10px] font-bold text-[#3D2B1F]/40 uppercase tracking-widest">
                            {order.status}
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isProfileQrExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-6"
            onClick={() => setIsProfileQrExpanded(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsProfileQrExpanded(false)}
                className="absolute -top-12 right-0 h-10 w-10 bg-white/10 rounded-full flex items-center justify-center text-white"
              >
                <X size={20} />
              </button>
              <div className="bg-white p-4 rounded-3xl w-full">
                <img
                  src="https://raw.githubusercontent.com/Dinni-hub/QRIS-pembayaran/main/Screenshot%202026-04-22%20202242.png"
                  alt="QRIS Pembayaran Indomi Nite Full"
                  className="w-full h-auto rounded-xl object-contain drop-shadow-md"
                  referrerPolicy="no-referrer"
                />
              </div>
              <p className="text-white text-center mt-6 text-[10px] font-bold tracking-[0.2em] uppercase">
                Screenshot atau unduh untuk menyimpan QRIS
              </p>
              <button
                onClick={async () => {
                  try {
                    const response = await fetch(
                      "https://raw.githubusercontent.com/Dinni-hub/QRIS-pembayaran/main/Screenshot%202026-04-22%20202242.png",
                    );
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "QRIS-Indomi-Nite.png";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error("Gagal mengunduh QRIS:", err);
                    const link = document.createElement("a");
                    link.href =
                      "https://raw.githubusercontent.com/Dinni-hub/QRIS-pembayaran/main/Screenshot%202026-04-22%20202242.png";
                    link.download = "QRIS-Indomi-Nite.png";
                    link.target = "_blank";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }
                }}
                className="mt-4 w-full bg-white text-[#3D2B1F] shadow-lg rounded-xl flex items-center justify-center p-4 gap-2 active:scale-95 transition-transform"
              >
                <Download size={18} />
                <span className="font-bold text-xs tracking-widest uppercase">
                  Unduh QRIS
                </span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CheckoutScreen({
  address,
  onAddressChange,
  paymentMethod,
  onPaymentMethodChange,
  cart,
  onBack,
  onOrderPlaced,
  customerName,
  customerPhone,
  customerEmail,
  onUpdateProfile,
}: {
  address: string;
  onAddressChange: (addr: string) => void;
  paymentMethod: string;
  onPaymentMethodChange: (method: string) => void;
  cart: CartItem[];
  onBack: () => void;
  onOrderPlaced: (
    name: string,
    phone: string,
    email: string,
    addr: string,
    isTestChecked: boolean,
  ) => void;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  onUpdateProfile: (name: string, phone: string, email: string) => void;
}) {
  const [name, setName] = useState(customerName);
  const [phone, setPhone] = useState(customerPhone);
  const [email, setEmail] = useState(customerEmail);
  const [isTestMode, setIsTestMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isQrExpanded, setIsQrExpanded] = useState(false);

  const handleDownloadQR = async () => {
    try {
      const response = await fetch(
        "https://raw.githubusercontent.com/Dinni-hub/QRIS-pembayaran/main/Screenshot%202026-04-22%20202242.png",
      );
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "QRIS-Indomi-Nite.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Gagal mengunduh QRIS:", err);
      const link = document.createElement("a");
      link.href =
        "https://raw.githubusercontent.com/Dinni-hub/QRIS-pembayaran/main/Screenshot%202026-04-22%20202242.png";
      link.download = "QRIS-Indomi-Nite.png";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (!cart || cart.length === 0) return null;

  const totalPayment = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  const toppingsPriceMap: { [key: string]: number } = {
    "Telur Rebus": 4000,
    Sosis: 1000,
    "Saus Tomat": 0,
    "Saus Sambal": 0,
  };

  return (
    <motion.div
      key="checkout"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full bg-[#F5F2EA]"
    >
      <div className="flex-1 overflow-y-auto pb-8">
        {/* Header */}
        <div className="flex items-center px-6 pt-4 pb-2 sticky top-0 bg-[#F5F2EA]/90 backdrop-blur-sm z-20">
          <button
            onClick={onBack}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#3D2B1F]/5"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="flex-1 text-center text-xl font-sans font-bold pr-10">
            Pembayaran
          </h2>
        </div>

        {/* Selection */}
        <div className="px-6 mt-6">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#3D2B1F]/50 mb-4 border-b border-[#3D2B1F]/10 pb-2">
            Pilihan Anda
          </h3>
          <div className="space-y-6">
            {cart.map((cartItem, idx) => (
              <div
                key={idx}
                className="flex flex-col gap-2 bg-white p-4 rounded-2xl border border-[#3D2B1F]/5 shadow-sm"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4 w-full">
                      <div className="h-12 w-12 rounded-xl overflow-hidden shrink-0 shadow-sm self-start">
                        <img
                          src={cartItem.item.img}
                          className="w-full h-full object-cover"
                          alt={cartItem.item.name}
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-start w-full">
                          <p className="font-sans font-bold text-[#3D2B1F]">
                            {cartItem.item.name.toLowerCase()} -{" "}
                            {cartItem.quantity}
                          </p>
                          <p className="font-bold text-[#3D2B1F] whitespace-nowrap ml-2">
                            Rp {cartItem.totalPrice.toLocaleString()}
                          </p>
                        </div>

                        {(!cartItem.item.categories.includes("Snack") ||
                          cartItem.item.name === "Telur Gulung" ||
                          cartItem.item.name === "Telur Gulung Sosis") &&
                          cartItem.toppings &&
                          cartItem.toppings.length > 0 && (
                            <div className="space-y-1">
                              {Object.entries(
                                cartItem.toppings.reduce(
                                  (acc: any, t: string) => {
                                    acc[t] = (acc[t] || 0) + 1;
                                    return acc;
                                  },
                                  {},
                                ),
                              ).map(([name, count]: [string, any]) => {
                                const cleanName = name
                                  .split("+")[0]
                                  .split("Rp")[0]
                                  .trim()
                                  .toLowerCase();
                                const isSaus =
                                  cleanName.includes("saus") ||
                                  cleanName.includes("sambal") ||
                                  cleanName.includes("tomat");

                                if (isSaus) {
                                  return (
                                    <p
                                      key={name}
                                      className="font-sans font-bold text-[#3D2B1F]"
                                    >
                                      {cleanName}
                                    </p>
                                  );
                                }

                                return (
                                  <p
                                    key={name}
                                    className="font-sans font-bold text-[#3D2B1F]"
                                  >
                                    {cleanName} - {count}
                                  </p>
                                );
                              })}
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                </div>

                {cartItem.notes && (
                  <div className="mt-1 pl-16">
                    <p className="text-[10px] italic text-[#3D2B1F]/40">
                      Catatan: {cartItem.notes}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Customer Info Form */}
        <div className="px-6 mt-10">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#3D2B1F]/50 mb-3">
            Informasi Pemesan
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-[#3D2B1F]/40 ml-2 mb-1 block">
                Nama Lengkap *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-14 bg-white rounded-2xl px-6 text-sm font-medium border border-[#3D2B1F]/10 focus:outline-none focus:ring-2 focus:ring-[#3D2B1F]/20"
                placeholder="Masukkan nama Anda"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-[#3D2B1F]/40 ml-2 mb-1 block">
                Nomor WhatsApp *
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full h-14 bg-white rounded-2xl px-6 text-sm font-medium border border-[#3D2B1F]/10 focus:outline-none focus:ring-2 focus:ring-[#3D2B1F]/20"
                placeholder="Untuk mengirim nota pesanan"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-[#3D2B1F]/40 ml-2 mb-2 block">
                Alamat Pengantaran *
              </label>
              <div className="space-y-3">
                {[
                  { id: "pickup", label: "Pick Up" },
                  { id: "auditorium", label: "Auditorium" },
                  { id: "gedung-u", label: "Depan Gedung U" },
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => onAddressChange(option.label)}
                    className={`w-full p-4 rounded-xl flex items-center justify-between transition-colors border ${
                      address === option.label
                        ? "border-[#3D2B1F] bg-[#3D2B1F]/5"
                        : "border-[#3D2B1F]/10 bg-white"
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${address === option.label ? "text-[#3D2B1F]" : "text-gray-600"}`}
                    >
                      {option.label}
                    </span>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        address === option.label
                          ? "border-[#3D2B1F]"
                          : "border-gray-300"
                      }`}
                    >
                      {address === option.label && (
                        <div className="w-2.5 h-2.5 bg-[#3D2B1F] rounded-full" />
                      )}
                    </div>
                  </button>
                ))}

                <div className="relative">
                  <input
                    type="text"
                    value={
                      !["", "Pick Up", "Auditorium", "Depan Gedung U"].includes(
                        address || "",
                      )
                        ? address
                        : ""
                    }
                    onChange={(e) => onAddressChange(e.target.value)}
                    onFocus={() => {
                      if (
                        ["Pick Up", "Auditorium", "Depan Gedung U"].includes(
                          address || "",
                        )
                      ) {
                        onAddressChange("");
                      }
                    }}
                    className={`w-full min-h-[56px] py-4 pl-4 pr-12 rounded-xl text-sm font-bold placeholder-gray-400 border transition-colors focus:outline-none focus:ring-2 focus:ring-[#3D2B1F]/20 ${
                      !["", "Pick Up", "Auditorium", "Depan Gedung U"].includes(
                        address || "",
                      )
                        ? "border-[#3D2B1F] bg-[#3D2B1F]/5 text-[#3D2B1F]"
                        : "border-[#3D2B1F]/10 bg-white text-gray-600"
                    }`}
                    placeholder="Contoh: Kantin kejujuran"
                  />
                  {!["", "Pick Up", "Auditorium", "Depan Gedung U"].includes(
                    address || "",
                  ) && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-[#3D2B1F] flex items-center justify-center pointer-events-none">
                      <div className="w-2.5 h-2.5 bg-[#3D2B1F] rounded-full" />
                    </div>
                  )}
                  {["", "Pick Up", "Auditorium", "Depan Gedung U"].includes(
                    address || "",
                  ) && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-gray-300 pointer-events-none"></div>
                  )}
                </div>
              </div>
            </div>
            {error && (
              <p className="text-red-500 text-xs font-bold ml-2">{error}</p>
            )}
          </div>
        </div>

        {/* Payment */}
        <div className="px-6 mt-10">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#3D2B1F]/50 mb-3">
            Metode Pembayaran
          </h3>
          <div className="space-y-3">
            <button
              onClick={() => onPaymentMethodChange("QRIS")}
              className={`w-full p-5 rounded-2xl flex items-center gap-4 transition-all ${paymentMethod === "QRIS" ? "bg-[#3D2B1F]/10 border-2 border-[#3D2B1F] text-[#3D2B1F]" : "bg-[#3D2B1F]/5 border border-[#3D2B1F]/10 text-[#3D2B1F]"}`}
            >
              <QrCode size={20} className="text-[#3D2B1F]" />
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-[#3D2B1F]">QRIS</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#3D2B1F]">
                  SCAN UNTUK MEMBAYAR
                </p>
              </div>
              {paymentMethod === "QRIS" && (
                <CheckCircle size={20} className="text-[#3D2B1F]" />
              )}
            </button>

            {paymentMethod === "QRIS" && (
              <div className="w-full p-6 bg-white rounded-3xl border border-[#3D2B1F]/10 flex flex-col items-center justify-center shadow-sm">
                <p className="text-xs font-bold text-[#3D2B1F]/60 uppercase tracking-widest text-center mb-4">
                  Scan QRIS untuk Pembayaran
                </p>
                
                <div 
                  onClick={() => setIsQrExpanded(true)}
                  className="relative group cursor-pointer bg-white p-4 rounded-2xl border-2 border-[#3D2B1F]/5 shadow-inner hover:border-[#3D2B1F]/20 transition-all max-w-[200px]"
                >
                  <img
                    src="https://raw.githubusercontent.com/Dinni-hub/QRIS-pembayaran/main/Screenshot%202026-04-22%20202242.png"
                    alt="QRIS Pembayaran Indomi Nite"
                    className="w-full h-auto rounded-lg object-contain"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-2xl flex items-center justify-center transition-opacity">
                    <span className="text-white text-xs font-bold px-3 py-1.5 bg-black/60 rounded-full flex items-center gap-1">
                      Perbesar
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-[#3D2B1F]/60 mt-3 font-semibold text-center leading-relaxed">
                  Silakan scan QRIS di atas untuk melakukan pembayaran otomatis. <br />
                  Klik gambar untuk memperbesar atau unduh pakai tombol di bawah.
                </p>

                <div className="flex gap-2 w-full mt-4">
                  <button
                    type="button"
                    onClick={() => setIsQrExpanded(true)}
                    className="flex-1 bg-[#3D2B1F]/5 text-[#3D2B1F] py-2.5 rounded-xl text-xs font-bold hover:bg-[#3D2B1F]/10 transition-colors flex items-center justify-center gap-1"
                  >
                    Perbesar
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadQR}
                    className="flex-1 bg-[#3D2B1F] text-white py-2.5 rounded-xl text-xs font-bold hover:bg-black transition-colors flex items-center justify-center gap-1"
                  >
                    <Download size={14} /> Unduh QRIS
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => onPaymentMethodChange("TUNAI")}
              className={`w-full p-5 rounded-2xl flex items-center gap-4 transition-all ${paymentMethod === "TUNAI" ? "bg-[#3D2B1F]/10 border-2 border-[#3D2B1F] text-[#3D2B1F]" : "bg-[#3D2B1F]/5 border border-[#3D2B1F]/10 text-[#3D2B1F]"}`}
            >
              <Banknote size={20} className="text-[#3D2B1F]" />
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-[#3D2B1F]">TUNAI</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#3D2B1F]">
                  SIAPKAN UANG PAS YA!
                </p>
              </div>
              {paymentMethod === "TUNAI" && (
                <CheckCircle size={20} className="text-[#3D2B1F]" />
              )}
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="mx-6 mt-10 mb-6 p-6 rounded-3xl bg-[#3D2B1F]/5 space-y-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-[#3D2B1F]/50">Subtotal</span>
            <span className="font-bold text-[#3D2B1F]">
              Rp{" "}
              {cart
                .reduce((sum, item) => sum + item.totalPrice, 0)
                .toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-[#3D2B1F]/50">Biaya Pengiriman</span>
            <span className="font-bold text-green-600">Gratis</span>
          </div>
          <div className="h-px bg-[#3D2B1F]/10 w-full"></div>
          <div className="flex justify-between items-end pt-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#3D2B1F]">
              Total Pembayaran
            </span>
            <span className="text-3xl font-sans font-bold text-[#3D2B1F] leading-none">
              Rp {totalPayment.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Bottom Action */}
        <div className="w-full px-6 pb-10 pt-4">
          <motion.button
            onClick={() => {
              if (isPlacingOrder) return;
              if (!name || !phone || !address) {
                setError(
                  "Mohon lengkapi Nama, Nomor WhatsApp, dan Alamat Pengantaran.",
                );
                return;
              }
              setIsPlacingOrder(true);
              onUpdateProfile(name, phone, email);
              onOrderPlaced(name, phone, email, address, isTestMode);
            }}
            disabled={isPlacingOrder}
            whileHover={{ scale: isPlacingOrder ? 1 : 1.02 }}
            whileTap={{ scale: isPlacingOrder ? 1 : 0.98 }}
            className={`w-full bg-[#3D2B1F] text-[#F5F2EA] h-16 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-3 shadow-xl ${isPlacingOrder ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            {isPlacingOrder ? "Memproses..." : "Pesan Sekarang"}
            <ShoppingBag size={20} />
          </motion.button>
        </div>
      </div>
      <AnimatePresence>
        {isQrExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-6"
            onClick={() => setIsQrExpanded(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsQrExpanded(false)}
                className="absolute -top-12 right-0 h-10 w-10 bg-white/10 rounded-full flex items-center justify-center text-white"
              >
                <X size={20} />
              </button>
              <div className="bg-white p-4 rounded-3xl w-full">
                <img
                  src="https://raw.githubusercontent.com/Dinni-hub/QRIS-pembayaran/main/Screenshot%202026-04-22%20202242.png"
                  alt="QRIS Pembayaran Indomi Nite Full"
                  className="w-full h-auto rounded-xl object-contain drop-shadow-md"
                  referrerPolicy="no-referrer"
                />
              </div>
              <p className="text-white text-center mt-6 text-[10px] font-bold tracking-[0.2em] uppercase">
                Screenshot atau unduh untuk membayar
              </p>
              <button
                onClick={handleDownloadQR}
                className="mt-4 w-full bg-white text-[#3D2B1F] shadow-lg rounded-xl flex items-center justify-center p-4 gap-2 active:scale-95 transition-transform"
              >
                <Download size={18} />
                <span className="font-bold text-xs tracking-widest uppercase">
                  Unduh QRIS
                </span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DetailScreen({
  item,
  onBack,
  onAddToCart,
  onBuyNow,
}: {
  item: any;
  onBack: () => void;
  onAddToCart: (cartDetails: CartItem) => void;
  onBuyNow: (cartDetails: CartItem) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [selectedToppings, setSelectedToppings] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const toppings =
    item.name === "Telur Gulung" || item.name === "Telur Gulung Sosis"
      ? [
          { name: "Saus Tomat", price: 0 },
          { name: "Saus Sambal", price: 0 },
        ]
      : [
          { name: "Telur Rebus", price: 4000 },
          { name: "Sosis", price: 1000 },
        ];

  const isSnack = item.categories.includes("Snack");

  const addTopping = (name: string) => {
    setSelectedToppings((prev) => [...prev, name]);
  };

  const removeTopping = (name: string) => {
    setSelectedToppings((prev) => {
      const idx = prev.lastIndexOf(name);
      if (idx > -1) {
        const newToppings = [...prev];
        newToppings.splice(idx, 1);
        return newToppings;
      }
      return prev;
    });
  };

  const getToppingCount = (name: string) => {
    return selectedToppings.filter((t) => t === name).length;
  };

  const pricePerItem = calculateItemPrice(
    item.name,
    item.priceNum,
    selectedToppings,
  );
  const toppingsTotal = selectedToppings.reduce(
    (acc, t) => acc + getToppingPrice(t),
    0,
  );
  const totalPrice = item.priceNum * quantity + toppingsTotal;

  const handleAddToCart = () => {
    onAddToCart({
      item,
      quantity,
      toppings: selectedToppings,
      totalPrice,
      notes,
    });
  };

  const handleBuyNow = () => {
    onBuyNow({
      item,
      quantity,
      toppings: selectedToppings,
      totalPrice,
      notes,
    });
  };

  const isTelurGulung =
    item.name === "Telur Gulung" || item.name === "Telur Gulung Sosis";

  return (
    <motion.div
      key="detail"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="flex flex-col h-full bg-[#F5F2EA]"
    >
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="relative h-[350px] w-full shrink-0 bg-[#F5F2EA]">
          <img
            src={item.img}
            className="w-full h-full object-cover object-center"
            alt={item.name}
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-10">
            <button
              onClick={handleAddToCart}
              className="h-10 w-10 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-md text-white"
            >
              <ArrowLeft size={20} />
            </button>
            <button className="h-10 w-10 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-md text-white">
              <SlidersHorizontal size={20} className="rotate-90" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-[#F5F2EA] -mt-10 rounded-t-[3rem] px-8 pt-8 relative z-10">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-2xl font-sans font-bold text-[#3D2B1F] max-w-[200px]">
              {item.name}
            </h2>
            <p className="text-xl font-bold text-[#3D2B1F]">{item.price}</p>
          </div>

          <p className="text-sm text-[#3D2B1F]/70 leading-relaxed mb-6">
            {item.description}
          </p>

          {(!isSnack || isTelurGulung) && (
            <>
              <div className="mb-6">
                <h3 className="text-lg font-bold text-[#3D2B1F] mb-4">
                  Add On :
                </h3>
                <div className="space-y-3">
                  {toppings.map((topping, i) => {
                    const count = getToppingCount(topping.name);
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-[#3D2B1F]">
                            {topping.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-[#3D2B1F]/50 font-bold">
                            {topping.price > 0
                              ? `+Rp ${topping.price.toLocaleString()}`
                              : "Gratis"}
                          </span>
                          {isTelurGulung ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (count > 0) {
                                  removeTopping(topping.name);
                                } else {
                                  addTopping(topping.name);
                                }
                              }}
                              className={`h-8 w-8 rounded-xl flex items-center justify-center border-2 transition-all ${count > 0 ? "bg-[#3D2B1F] border-[#3D2B1F] text-white" : "border-[#3D2B1F]/20 text-transparent"}`}
                            >
                              <Check size={16} />
                            </button>
                          ) : (
                            <div className="flex items-center gap-3 bg-white rounded-full px-2 py-1 shadow-sm">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeTopping(topping.name);
                                }}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${count > 0 ? "bg-[#3D2B1F] text-white" : "bg-gray-100 text-gray-400"}`}
                                disabled={count === 0}
                              >
                                <Minus size={16} />
                              </button>
                              <span className="font-bold text-[#3D2B1F] w-6 text-center">
                                {count}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addTopping(topping.name);
                                }}
                                className="w-8 h-8 rounded-full bg-[#3D2B1F] text-white flex items-center justify-center"
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="mb-6">
            <h3 className="text-lg font-bold text-[#3D2B1F] mb-3">
              Instruksi Khusus
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                item.name === "Telur Gulung" ||
                item.name === "Telur Gulung Sosis"
                  ? "Contoh: tanpa saus, saus pedas, saus tomat"
                  : isSnack
                    ? "Contoh: Bumbu dipisah, ekstra pedas..."
                    : "Contoh: Telur setengah matang, tanpa bumbu pedas..."
              }
              className="w-full h-24 bg-white rounded-3xl p-6 text-sm font-medium border border-[#3D2B1F]/5 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3D2B1F]/10 resize-none"
            ></textarea>
          </div>

          <div className="w-full pb-10 pt-4 flex flex-col gap-3 px-6">
            <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 border border-[#3D2B1F]/10 shadow-sm mb-2">
              <span className="text-sm font-bold text-[#3D2B1F]">
                Jumlah Porsi
              </span>
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="h-8 w-8 flex items-center justify-center rounded-full bg-[#3D2B1F]/5 text-[#3D2B1F] hover:bg-[#3D2B1F]/10 transition-colors"
                >
                  <Minus size={16} />
                </button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val > 0) {
                      setQuantity(val);
                    } else if (e.target.value === "") {
                      setQuantity("" as any);
                    }
                  }}
                  onBlur={() => {
                    if (!quantity || quantity < 1) setQuantity(1);
                  }}
                  className="text-xl font-bold text-[#3D2B1F] w-16 text-center bg-transparent outline-none"
                />
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="h-8 w-8 flex items-center justify-center rounded-full bg-[#3D2B1F] text-white hover:bg-black transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <motion.button
              onClick={handleBuyNow}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-[#3D2B1F] text-[#F5F2EA] h-12 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center shadow-xl"
            >
              <span>Pesan Sekarang</span>
              <span className="text-[10px] opacity-80 ml-2">
                Rp {totalPrice.toLocaleString()}
              </span>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function OrdersScreen({
  onBack,
  onGoHome,
  orders,
  cart,
  customerName,
  currentUser,
  onRateOrder,
  onNewOrder,
  onCancelOrder,
  onDeleteOrder,
  isFirebaseConfigured,
}: {
  onBack: () => void;
  onGoHome: (tab?: string) => void;
  orders: Order[];
  cart?: CartItem[];
  customerName: string;
  currentUser: any;
  onRateOrder: (orderId: string, rating: number, feedback: string) => void;
  onNewOrder?: () => void;
  onCancelOrder?: (orderId: string) => void;
  onDeleteOrder?: (orderId: string | string[]) => void;
  isFirebaseConfigured?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const [globalCompletedCount, setGlobalCompletedCount] = useState(0);

  useEffect(() => {
    if (isFirebaseConfigured) {
      const today = new Date();
      const dStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const unsub = onSnapshot(
        doc(db, "counters", "completed_" + dStr),
        (snap) => {
          if (snap.exists()) {
            setGlobalCompletedCount(snap.data().count || 0);
          }
        },
      );
      return () => unsub();
    }
  }, [isFirebaseConfigured]);

  // Force editor sync
  const activeOrders = [
    ...orders.filter(
      (o) =>
        !o.isDeleted &&
        o.status !== "selesai" &&
        o.status !== "dibatalkan" &&
        (o.customerName === customerName ||
          (currentUser && o.uid === currentUser.uid) ||
          (currentUser && o.customerEmail === currentUser.email)),
    ),
  ].sort((a, b) => {
    const timeA =
      a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
    const timeB =
      b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    const timeDiff = timeB.getTime() - timeA.getTime();
    if (timeDiff !== 0) return timeDiff;
    const aId = a.firebaseKey || a.id || "";
    const bId = b.firebaseKey || b.id || "";
    return bId.localeCompare(aId);
  });
  const cancelledOrders = orders.filter(
    (o) =>
      o.status === "dibatalkan" &&
      (o.customerName === customerName ||
        (currentUser && o.uid === currentUser.uid) ||
        (currentUser && o.customerEmail === currentUser.email)),
  );
  const completedOrders = orders.filter(
    (o) =>
      o.status === "selesai" &&
      (o.customerName === customerName ||
        (currentUser && o.uid === currentUser.uid) ||
        (currentUser && o.customerEmail === currentUser.email)),
  );
  const hasActiveOrder = activeOrders.length > 0;
  const hasAnyOrder = activeOrders.length > 0;

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleProfileClick = () => {
    onGoHome("pengaturan");
  };

  return (
    <motion.div
      key="status"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="flex flex-col h-full bg-[#F5F2EA] overflow-hidden relative"
    >
      {/* Header */}
      <div className="flex items-center px-6 pt-4 pb-2">
        <button
          onClick={onBack}
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#3D2B1F]/5"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="flex-1 text-center text-xl font-sans font-bold pr-10 text-[#3D2B1F]">
          Status Pesanan
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto pb-40">
        {!hasAnyOrder ? (
          <div className="flex flex-col items-center justify-center text-center px-8 pt-20 pb-10">
            <div className="w-24 h-24 rounded-full bg-[#3D2B1F]/5 flex items-center justify-center mb-6">
              <ReceiptText size={40} className="text-[#3D2B1F]/40" />
            </div>
            <h3 className="text-2xl font-sans font-bold text-[#3D2B1F] mb-2">
              Belum Ada Pesanan
            </h3>
            <p className="text-[#3D2B1F]/60 mb-8 max-w-[250px]">
              Kamu belum membuat pesanan apapun. Yuk, pesan Mie spesialmu
              sekarang!
            </p>
            <button
              onClick={() => {
                if (onNewOrder) onNewOrder();
                onGoHome("home");
              }}
              className="bg-[#3D2B1F] text-[#F5F2EA] px-8 py-4 rounded-full font-bold uppercase tracking-widest text-xs shadow-xl hover:bg-black transition-colors"
            >
              Pesan Sekarang
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-8 pt-0">
            {(() => {
              // Use the most recent or first active order for the general status/timer
              const primaryOrder = activeOrders[0];

              const primaryTime =
                primaryOrder.timestamp instanceof Date
                  ? primaryOrder.timestamp.getTime()
                  : (primaryOrder.timestamp as any)?.toDate?.()?.getTime() ||
                    new Date(primaryOrder.timestamp).getTime();
              const startTime = primaryTime;
              const elapsed = Math.max(0, (now - startTime) / 1000);

              const isDemo =
                String(primaryOrder.id).includes("DEMO") ||
                primaryOrder.isDemo ||
                String(primaryOrder.orderNumber) === "9999";

              // Count orders that were placed BEFORE this primaryOrder and are still active
              const primaryDateObj =
                primaryOrder.timestamp instanceof Date
                  ? primaryOrder.timestamp
                  : (primaryOrder.timestamp as any)?.toDate?.() ||
                    new Date(primaryOrder.timestamp);
              const primaryDateStr = primaryDateObj.toDateString();

              const queuedBeforeMeCount = orders.filter((o) => {
                const oDateObj =
                  o.timestamp instanceof Date
                    ? o.timestamp
                    : (o.timestamp as any)?.toDate?.() || new Date(o.timestamp);

                const t = oDateObj.getTime();

                return (
                  o.id !== primaryOrder.id &&
                  oDateObj.toDateString() === primaryDateStr &&
                  t < primaryTime &&
                  o.status !== "selesai" &&
                  o.status !== "dibatalkan" &&
                  !o.isDeleted
                );
              }).length;

              const queueAhead = queuedBeforeMeCount;

              // Setiap pesanan memiliki waktu rata-rata 10 menit
              const totalMins = (queueAhead + 1) * 10;

              const duration = totalMins * 60;
              const remaining = Math.max(0, duration - elapsed);
              const isOvertime = remaining === 0;
              const displaySeconds = isOvertime
                ? elapsed - duration
                : remaining;
              const orderStatus = primaryOrder.status;

              // Format time
              const hours = Math.floor(displaySeconds / 3600);
              const mins = Math.floor((displaySeconds % 3600) / 60);
              const secs = Math.floor(displaySeconds % 60);
              const sign = "";
              const formattedTime =
                hours > 0
                  ? `${sign}${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
                  : `${sign}${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

              return (
                <div className="flex flex-col items-center">
                  {/* Video at the top - Full Width */}
                  <div className="w-full mb-8 rounded-b-[3.5rem] overflow-hidden shadow-2xl">
                    <video
                      src="/video-elang.mp4"
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full object-cover aspect-video"
                    />
                  </div>

                  {/* Content with Padding */}
                  <div className="w-full px-6 flex flex-col items-center">
                    {/* Circular Countdown Timer */}
                    <div className="relative w-56 h-56 flex items-center justify-center mb-8">
                      <div
                        className={`absolute inset-0 bg-white rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.04)] ${isOvertime ? "animate-pulse" : ""}`}
                      ></div>

                      <svg
                        viewBox="0 0 224 224"
                        className="absolute inset-0 w-full h-full transform -rotate-90"
                      >
                        <circle
                          cx="112"
                          cy="112"
                          r="100"
                          stroke="#3D2B1F"
                          strokeWidth="6"
                          fill="transparent"
                          className="opacity-10"
                        />
                        <circle
                          cx="112"
                          cy="112"
                          r="100"
                          stroke="#3D2B1F"
                          strokeWidth="6"
                          fill="transparent"
                          strokeDasharray={2 * Math.PI * 100}
                          strokeDashoffset={
                            isOvertime
                              ? 0
                              : 2 *
                                Math.PI *
                                100 *
                                (1 - (duration > 0 ? remaining / duration : 1))
                          }
                          strokeLinecap="round"
                          className="transition-all duration-1000 ease-linear"
                        />
                      </svg>

                      <div className="flex flex-col items-center z-10">
                        <span className="text-3xl font-sans font-bold tracking-wider text-[#3D2B1F]">
                          {formattedTime}
                        </span>
                        <span className="text-xs font-medium text-[#3D2B1F]/60 mt-1 text-center px-4">
                          {isOvertime
                            ? orderStatus === "diterima"
                              ? "Masih dalam antrian"
                              : "Sedang dimasak"
                            : queueAhead > 0
                              ? `Tersisa ${queueAhead} antrean di depanmu`
                              : "Sedang disiapkan"}
                        </span>
                      </div>
                    </div>

                    {/* Status Text */}
                    <div className="w-full text-center mb-8">
                      <h3 className="text-xl font-sans font-bold text-[#3D2B1F] mb-1">
                        {orderStatus === "diterima" && "Pesanan Diterima"}
                        {orderStatus === "dimasak" && "Sedang Dimasak"}
                        {orderStatus === "diantar" && "Sedang Diantar"}
                      </h3>

                      <p className="text-sm text-[#3D2B1F]/60 mb-2">
                        {orderStatus === "diterima" &&
                          "Menunggu koki menyiapkan pesananmu."}
                        {orderStatus === "dimasak" &&
                          "Harap tunggu sebentar, ya."}
                        {orderStatus === "diantar" &&
                          "Kurir sedang menuju ke tempatmu."}
                      </p>

                      {isOvertime && (
                        <p className="text-[#3D2B1F] text-sm font-medium animate-fade-in">
                          {orderStatus === "diterima"
                            ? "Pesanan Anda masih dalam antrean. Mohon tunggu sebentar lagi ya!"
                            : "Pesanan Anda sedang dalam proses penyelesaian. Mohon tunggu sebentar lagi ya!"}
                        </p>
                      )}
                    </div>

                    {/* Quote Box */}
                    <div className="w-full bg-[#3D2B1F]/5 rounded-[2rem] p-6 flex items-center gap-4 mb-8">
                      <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                        <Utensils size={20} className="text-[#3D2B1F]" />
                      </div>
                      <p className="text-[#3D2B1F] font-sans italic font-medium">
                        "Pesanan spesialmu akan segera siap!"
                      </p>
                    </div>

                    {/* Order Details Cards - One for each active order */}
                    <div className="w-full space-y-6">
                      {activeOrders.map((order, idx) => (
                        <div
                          key={
                            order.firebaseKey ||
                            `${order.id}-${order.sessionId || idx}`
                          }
                          className={`w-full bg-white rounded-[2.5rem] p-6 shadow-sm border border-[#3D2B1F]/5`}
                        >
                          <div className="mb-4">
                            <p className="text-[10px] font-bold text-[#3D2B1F] uppercase tracking-widest">
                              Detail Pesanan
                            </p>
                          </div>
                          <div className="space-y-4">
                            {order.items &&
                              Array.isArray(order.items) &&
                              order.items
                                .filter((i) => i && i.item)
                                .map((item, idx) => {
                                  const toppingCounts = (
                                    item.toppings || []
                                  ).reduce((acc: any, t: string) => {
                                    acc[t] = (acc[t] || 0) + 1;
                                    return acc;
                                  }, {});
                                  const toppingsTotal = (
                                    item.toppings || []
                                  ).reduce(
                                    (acc: number, t: string) =>
                                      acc + getToppingPrice(t),
                                    0,
                                  );
                                  const baseItemPrice =
                                    item.totalPrice - toppingsTotal;

                                  return (
                                    <div
                                      key={idx}
                                      className="flex flex-col border-b border-dashed border-[#3D2B1F]/20 pb-4 mb-4 last:border-0 last:pb-0 last:mb-0"
                                    >
                                      <div className="flex justify-between items-start">
                                        <p className="text-sm font-bold text-[#3D2B1F]">
                                          {item.item.name} - {item.quantity}
                                        </p>
                                        <p className="text-sm font-bold text-[#3D2B1F]">
                                          Rp {baseItemPrice.toLocaleString()}
                                        </p>
                                      </div>
                                      {item.toppings &&
                                        item.toppings.length > 0 && (
                                          <div className="mt-2 pt-2 border-t border-dashed border-[#3D2B1F]/20">
                                            <p className="text-[10px] text-[#3D2B1F]/60 uppercase tracking-widest mb-1 font-bold">
                                              Add on:
                                            </p>
                                            {Object.entries(toppingCounts).map(
                                              (
                                                [tName, tCount]: [string, any],
                                                tIdx,
                                              ) => {
                                                const cleanName = tName
                                                  .replace(
                                                    /\s*\+?\s*Rp\s*[\d\.]+/gi,
                                                    "",
                                                  )
                                                  .trim();
                                                return (
                                                  <div
                                                    key={tIdx}
                                                    className="flex justify-between items-start text-xs text-[#3D2B1F]/80"
                                                  >
                                                    <p className="font-bold">
                                                      {cleanName} - {tCount}
                                                    </p>
                                                    <p className="font-bold">
                                                      Rp{" "}
                                                      {(
                                                        tCount *
                                                        getToppingPrice(tName)
                                                      ).toLocaleString()}
                                                    </p>
                                                  </div>
                                                );
                                              },
                                            )}
                                          </div>
                                        )}
                                      {item.notes && (
                                        <p className="text-xs text-[#3D2B1F]/60 mt-2 italic">
                                          catatan: {item.notes}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                          </div>

                          <div className="mt-4 pt-4 border-t border-[#3D2B1F]/5 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-[#3D2B1F]/60 uppercase tracking-widest">
                                Total Pembayaran
                              </span>
                              <span className="text-lg font-sans font-bold text-[#3D2B1F]">
                                Rp {(order.total || 0).toLocaleString()}
                              </span>
                            </div>

                            {(order.isDemo ||
                              String(order.id).includes("DEMO")) &&
                              order.status !== "selesai" &&
                              order.status !== "dibatalkan" && (
                                <div className="mt-6 flex justify-center">
                                  <button
                                    onClick={() =>
                                      onDeleteOrder?.(
                                        order.firebaseKey || order.id,
                                      )
                                    }
                                    className="bg-red-50 text-red-600 px-6 py-2 rounded-full font-bold text-[10px] uppercase tracking-widest border border-red-200 hover:bg-red-100 transition-colors"
                                  >
                                    Hapus Pesanan (Demo)
                                  </button>
                                </div>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="w-full mt-2 mb-8 flex justify-center">
              <button
                onClick={() => {
                  if (onNewOrder) onNewOrder();
                  onGoHome("home");
                }}
                className="bg-[#3D2B1F] text-[#F5F2EA] px-8 py-4 rounded-full font-bold uppercase tracking-widest text-xs shadow-xl hover:bg-black transition-colors shadow-lg"
              >
                Pesan Baru / Tambah Pesanan
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="absolute bottom-[-2px] left-0 right-0 w-full h-[98px] pb-[2px] bg-[#3D2B1F] flex items-center justify-between px-6 rounded-t-[3.5rem] shadow-2xl z-50">
        <button
          onClick={() => onGoHome("home")}
          className="flex flex-col items-center gap-1 transition-colors text-white/40"
        >
          <Home size={20} />
          <span className="text-[9px] font-bold uppercase tracking-widest">
            Home
          </span>
        </button>
        <button
          onClick={() => onGoHome("cart")}
          className="flex flex-col items-center gap-1 transition-colors text-white/40"
        >
          <div className="relative">
            <ShoppingBag size={20} />
            {cart && cart.length > 0 && (
              <div className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full border-2 border-[#3D2B1F]"></div>
            )}
          </div>
          <span className="text-[9px] font-bold uppercase tracking-widest">
            Keranjang
          </span>
        </button>
        <button
          onClick={() => onGoHome("riwayat")}
          className="flex flex-col items-center gap-1 transition-colors text-white/40"
        >
          <ReceiptText size={20} />
          <span className="text-[9px] font-bold uppercase tracking-widest">
            Riwayat
          </span>
        </button>
        <button
          onClick={() => onGoHome("orders")}
          className="flex flex-col items-center gap-1 transition-colors text-white"
        >
          <div className="relative">
            <ShoppingBag size={20} />
            {hasActiveOrder && (
              <div className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full border-2 border-[#3D2B1F]"></div>
            )}
          </div>
          <span className="text-[9px] font-bold uppercase tracking-widest">
            Pesanan
          </span>
        </button>
        <button
          onClick={handleProfileClick}
          className="flex flex-col items-center gap-1 transition-colors text-white/40"
        >
          <User size={20} />
          <span className="text-[9px] font-bold uppercase tracking-widest">
            Profile
          </span>
        </button>
      </div>
    </motion.div>
  );
}

function AppFeedbackModal({
  show,
  onClose,
  onSubmit,
}: {
  show: boolean;
  onClose: () => Promise<void>;
  onSubmit: (rating: number, feedback: string) => Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2rem] p-6 shadow-2xl w-full max-w-sm"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-[#3D2B1F]">
            Kritik & Saran Aplikasi
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>
        <p className="text-sm text-[#3D2B1F]/60 mb-6">
          Bagaimana pengalaman Anda menggunakan aplikasi ini?
        </p>

        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className={`${star <= rating ? "text-yellow-400" : "text-gray-400"}`}
            >
              <Star size={32} fill={star <= rating ? "#FBBF24" : "none"} />
            </button>
          ))}
        </div>

        <textarea
          className="w-full h-24 bg-stone-50 rounded-2xl p-4 mb-4 text-sm"
          placeholder="Tulis kritik atau saran Anda untuk aplikasi..."
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          maxLength={999}
        />

        <div className="flex flex-col gap-3">
          <button
            onClick={async () => {
              if (rating > 0) {
                setIsSubmitting(true);
                await onSubmit(rating, feedback);
                setRating(0);
                setFeedback("");
                setIsSubmitting(false);
                onClose();
              }
            }}
            disabled={rating === 0 || isSubmitting}
            className={`w-full py-4 rounded-2xl font-bold ${rating > 0 ? "bg-[#3D2B1F] text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
          >
            {isSubmitting ? "Mengirim..." : "Kirim"}
          </button>

          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl font-bold text-[#3D2B1F]/40 text-sm hover:bg-stone-50 transition-colors"
          >
            Lain Kali Saja (Skip)
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function EditCartItemModal({
  show,
  cartItem,
  onClose,
  onSave,
}: {
  show: boolean;
  cartItem: CartItem | null;
  onClose: () => void;
  onSave: (updatedItem: CartItem) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [selectedToppings, setSelectedToppings] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (cartItem) {
      setQuantity(cartItem.quantity);
      setSelectedToppings(cartItem.toppings || []);
      setNotes(cartItem.notes || "");
    }
  }, [cartItem]);

  if (!show || !cartItem) return null;

  const item = cartItem.item;
  const toppings =
    item.name === "Telur Gulung" || item.name === "Telur Gulung Sosis"
      ? [
          { name: "Saus Tomat", price: 0 },
          { name: "Saus Sambal", price: 0 },
        ]
      : [
          { name: "Telur Rebus", price: 4000 },
          { name: "Sosis", price: 1000 },
        ];

  const isSnack = item.categories.includes("Snack");
  const isTelurGulung =
    item.name === "Telur Gulung" || item.name === "Telur Gulung Sosis";

  const addTopping = (name: string) => {
    setSelectedToppings((prev) => [...prev, name]);
  };

  const removeTopping = (name: string) => {
    setSelectedToppings((prev) => {
      const idx = prev.lastIndexOf(name);
      if (idx > -1) {
        const newToppings = [...prev];
        newToppings.splice(idx, 1);
        return newToppings;
      }
      return prev;
    });
  };

  const getToppingCount = (name: string) => {
    return selectedToppings.filter((t) => t === name).length;
  };

  const pricePerItem = calculateItemPrice(
    item.name,
    item.priceNum,
    selectedToppings,
  );
  const toppingsTotal = selectedToppings.reduce(
    (acc, t) => acc + getToppingPrice(t),
    0,
  );
  const totalPrice = item.priceNum * quantity + toppingsTotal;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-[#3D2B1F]">Edit Pesanan</h3>
          <button
            onClick={onClose}
            className="h-8 w-8 bg-stone-100 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-200"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-4 mb-6">
          <div className="h-20 w-20 rounded-2xl overflow-hidden shrink-0">
            <img
              src={item.img}
              className="w-full h-full object-cover"
              alt={item.name}
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h4 className="font-bold text-[#3D2B1F] text-lg">{item.name}</h4>
            <p className="text-sm font-bold text-[#D4AF37]">
              Rp {item.priceNum.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <h4 className="font-bold text-[#3D2B1F] mb-3">Jumlah</h4>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="h-12 w-12 rounded-full border border-[#3D2B1F]/10 flex items-center justify-center text-[#3D2B1F] hover:bg-stone-50"
            >
              <Minus size={20} />
            </button>
            <span className="text-xl font-bold text-[#3D2B1F] w-8 text-center">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="h-12 w-12 rounded-full border border-[#3D2B1F]/10 flex items-center justify-center text-[#3D2B1F] hover:bg-stone-50"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {(!isSnack || isTelurGulung) && toppings.length > 0 && (
          <div className="mb-6">
            <h4 className="font-bold text-[#3D2B1F] mb-3">Add-on</h4>
            <div className="space-y-3">
              {toppings.map((topping, idx) => {
                const count = getToppingCount(topping.name);
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-2xl border border-[#3D2B1F]/10"
                  >
                    <div>
                      <p className="font-bold text-[#3D2B1F]">{topping.name}</p>
                      {topping.price > 0 && (
                        <p className="text-xs text-[#3D2B1F]/60">
                          + Rp {topping.price.toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {isTelurGulung ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (count > 0) {
                              removeTopping(topping.name);
                            } else {
                              addTopping(topping.name);
                            }
                          }}
                          className={`h-8 w-8 rounded-xl flex items-center justify-center border-2 transition-all ${count > 0 ? "bg-[#3D2B1F] border-[#3D2B1F] text-white" : "border-[#3D2B1F]/20 text-transparent"}`}
                        >
                          <Check size={16} />
                        </button>
                      ) : (
                        <>
                          {count > 0 && (
                            <button
                              onClick={() => removeTopping(topping.name)}
                              className="h-8 w-8 rounded-full bg-stone-100 flex items-center justify-center text-[#3D2B1F]"
                            >
                              <Minus size={14} />
                            </button>
                          )}
                          {count > 0 && (
                            <span className="font-bold text-[#3D2B1F] w-4 text-center">
                              {count}
                            </span>
                          )}
                          <button
                            onClick={() => addTopping(topping.name)}
                            className="h-8 w-8 rounded-full bg-[#3D2B1F] flex items-center justify-center text-white"
                          >
                            <Plus size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mb-6">
          <h4 className="font-bold text-[#3D2B1F] mb-3">Catatan (Opsional)</h4>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contoh: Pedas, jangan pakai bawang..."
            className="w-full bg-stone-50 border border-stone-200 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37] resize-none h-24"
          />
        </div>

        <div className="pt-4 border-t border-[#3D2B1F]/10">
          <div className="flex justify-between items-center mb-4">
            <span className="font-bold text-[#3D2B1F]">Total</span>
            <span className="text-xl font-bold text-[#3D2B1F]">
              Rp {totalPrice.toLocaleString()}
            </span>
          </div>
          <button
            onClick={() => {
              console.log("Simpan Perubahan clicked", {
                item,
                quantity,
                toppings: selectedToppings,
                totalPrice,
                notes,
              });
              onSave({
                item,
                quantity,
                toppings: selectedToppings,
                totalPrice,
                notes,
              });
              onClose();
            }}
            className="w-full h-14 bg-[#3D2B1F] text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform"
          >
            Simpan Perubahan
          </button>
        </div>
      </motion.div>
    </div>
  );
}
