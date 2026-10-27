import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  useEffect(() => { window.location.replace("/story/index.html" + window.location.hash); }, []);
  return <p>Opening the InfoMorph story… <a href="/story/index.html">Continue</a></p>;
}
