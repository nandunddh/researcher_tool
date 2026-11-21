import { hydrateRoot } from "react-dom/client";
import { ExportContent, type ExportPage } from "./export-content";

const page: ExportPage = JSON.parse(document.getElementById("studio-data")!.textContent!);
hydrateRoot(document.getElementById("studio-site")!, <ExportContent {...page} />);
