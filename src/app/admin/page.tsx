import type { Metadata } from "next";
import AdminApp from "@/components/AdminApp";
import HalloweenFx from "@/components/HalloweenFx";

export const metadata: Metadata = { title: "Admin — Halloween Drawing Contest" };

export default function AdminPage() {
  return (
    <main className="admin-stage flex-1">
      <div className="admin-atmosphere" aria-hidden="true">
        <div className="admin-moon" />
        <HalloweenFx floatingSymbol="🎃" />
        <div className="admin-embers">
          {Array.from({ length: 7 }, (_, i) => <span key={i} />)}
        </div>
        <svg className="admin-horizon" viewBox="0 0 1440 220" preserveAspectRatio="none">
          <path d="M0 140Q160 80 340 150T710 140T1080 145T1440 105V220H0Z" fill="#100b19" />
          <path d="M65 180 72 62 45 35 74 49 85 13 82 81 109 53 87 100 88 180ZM1260 180 1252 78 1222 48 1251 61 1243 20 1261 51 1288 29 1263 76 1274 180Z" fill="#0b0811" />
          <path d="M1070 178V111H1058L1091 76 1124 111H1112V178ZM1120 178V137H1110L1137 109 1164 137H1154V178Z" fill="#0b0811" />
          <path d="M1086 124h9v16h-9ZM1133 144h7v10h-7Z" fill="#ff8c3655" />
        </svg>
      </div>
      <div className="admin-content mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
        <AdminApp />
      </div>
    </main>
  );
}