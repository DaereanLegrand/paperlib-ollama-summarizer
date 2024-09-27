import { readFileSync } from "fs";
import { PLAPI, PLExtAPI } from "paperlib-api/api";
import { PaperEntity } from "paperlib-api/model";
import { urlUtils } from "paperlib-api/utils";

import pdfworker from "@/utils/pdfjs/worker";

async function cmapProvider(name) {
  let buf = readFileSync(__dirname + "/cmaps/" + name + ".bcmap");
  return {
    compressionType: 1,
    cMapData: buf,
  };
}

let fontCache = {};
async function standardFontProvider(filename) {
  if (fontCache[filename]) {
    return fontCache[filename];
  }
  let data = readFileSync(__dirname + "/standard_fonts/" + filename);
  fontCache[filename] = data;
  return data;
}

export class OllamaSummaryExtService {
  async getPDFText(fileURL: string, pageNum: number = 5) {
    try {
      const buf = readFileSync(urlUtils.eraseProtocol(fileURL));

      const data = await pdfworker.getFulltext(
        buf,
        "",
        pageNum,
        cmapProvider,
        standardFontProvider,
      );

      return data.text || "";
    } catch (e) {
      PLAPI.logService.error(
        "Failed to get PDF text.",
        e as Error,
        true,
        "OllamaSummaryExt",
      );
      return "";
    }
  }

  async summarize(
    paperEntity: PaperEntity,
    pageNum: number = 5,
    prompt: string,
    systemInstruction: string = "",
    model: string = "llama3.1",
    customAPIURL: string = "http://127.0.0.1:11434/api/chat",
  ) {
    const fileURL = await PLAPI.fileService.access(paperEntity.mainURL, true);
    const text = await this.getPDFText(fileURL, pageNum);
    let query = prompt + text;

    const messages = [
      {
        role: "system",
        content: systemInstruction,
      },
      {
        role: "user",
        content: query,
      },
    ];

    const headers = {
      "Content-Type": "application/json",
    };

    const body = {
      model: model,
      messages: messages,
      stream: false,
    };

    try {
      const response = (await PLExtAPI.networkTool.post(
        customAPIURL,
        body,
        headers,
        0,
        300000,
        false,
        true,
      )) as any;

      if (
        response.body instanceof String ||
        typeof response.body === "string"
      ) {
        return JSON.parse(response.body);
      } else {
        return response.body;
      }
    } catch (error) {
      PLAPI.logService.error(
        "Failed to obtain response.",
        error as Error,
        true,
        "OllamaSummaryExt",
      );
      return error as Error;
    }
  }

  async tag() {}

  async filter() {}
}
