import type { Metadata } from "next";
import { invitesRequired } from "@/lib/invite";
import RegisterForm from "./register-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Регистрация" };

export default function RegisterPage() {
  return <RegisterForm inviteRequired={invitesRequired()} />;
}
