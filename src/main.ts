import { PLAPI, PLExtAPI, PLExtension, PLMainAPI } from "paperlib-api/api";
import { PaperEntity } from "paperlib-api/model";

import { OllamaSummaryExtService } from "./services/service";

class PaperlibExtension extends PLExtension {
  disposeCallbacks: (() => void)[];

  private readonly _service: OllamaSummaryExtService;

  constructor() {
    super({
      id: "ollama-summarizer-paperlib-extension",
      defaultPreference: {
        markdown: {
          type: "boolean",
          name: "Markdown Style",
          description: "Use markdown style for the summary note.",
          value: true,
          order: 0,
        },
        "ai-model": {
          type: "options",
          name: "LLM model",
          description: "Ollama model to use",
          options: {
            "llama3.1": "Llama 3.1",
            era: "EtherealR",
          },
          value: "llama3.1",
          order: 1,
        },
        pageNum: {
          type: "string",
          name: "Page Number",
          description: "The number of pages to provide.",
          value: "5",
          order: 2,
        },
      },
    });

    this.disposeCallbacks = [];
    this._service = new OllamaSummaryExtService();
  }

  async initialize() {
    await PLExtAPI.extensionPreferenceService.register(
      this.id,
      this.defaultPreference,
    );

    // Summarize
    this.disposeCallbacks.push(
      PLAPI.commandService.on("summarize_selected_paper" as any, (value) => {
        this.summarize();
      }),
    );

    this.disposeCallbacks.push(
      PLAPI.commandService.registerExternel({
        id: `summarize`,
        description: "Summarize the current selected paper with ollama.",
        event: "summarize_selected_paper",
      }),
    );

    this.disposeCallbacks.push(
      PLMainAPI.contextMenuService.on(
        "dataContextMenuFromExtensionsClicked",
        (value) => {
          const { extID, itemID } = value.value;
          if (extID === this.id && itemID === "summarize") {
            this.summarize();
          }
        },
      ),
    );

    PLMainAPI.contextMenuService.registerContextMenu(this.id, [
      {
        id: "summarize",
        label: "Ollama Summary - summarize",
      },
    ]);
  }

  async dispose() {
    PLExtAPI.extensionPreferenceService.unregister(this.id);
    PLMainAPI.contextMenuService.unregisterContextMenu(this.id);

    this.disposeCallbacks.forEach((callback) => callback());
  }

  async summarize() {
    await PLAPI.uiStateService.setState({
      "processingState.general":
        parseInt(
          (await PLAPI.uiStateService.getState(
            "processingState.general",
          )) as string,
        ) + 1,
    });

    try {
      PLAPI.logService.info("Start try.", "", true, this.id);

      const selectedPaperEntities = (await PLAPI.uiStateService.getState(
        "selectedPaperEntities",
      )) as PaperEntity[];

      if (selectedPaperEntities.length !== 1) {
        return;
      }

      const paperEntity = selectedPaperEntities[0];

      const useMarkdown = await PLExtAPI.extensionPreferenceService.get(
        this.id,
        "markdown",
      );

      const aiModel = await PLExtAPI.extensionPreferenceService.get(
        this.id,
        "ai-model",
      );

      const pageNum = parseInt(
        (await PLExtAPI.extensionPreferenceService.get(
          this.id,
          "pageNum",
        )) as string,
      );

      const customAPIURL = "http://127.0.0.1:11434/api/chat";

      const mprompt = `Please summarize the following paper by focusing on the key findings and main arguments. Limit the summary to 150 words and present it in a clear, format. Do not include introductory phrases like 'The summary is...' or any unnecessary filler. Title: ${paperEntity.title}`;

      let systemInstruction =
        "You are an AI assistant for summarizing academic publications. You answer with a perfect summary of the given text. You do not add unnecessary filler, you just answer with the summary.\n";
      if (useMarkdown) {
        systemInstruction +=
          "Don't start with a title etc. Please format the output in markdown style.\n";
      }

      let summary = await this._service.summarize(
        paperEntity,
        pageNum,
        mprompt,
        systemInstruction,
        aiModel,
        customAPIURL,
      );
      summary = summary.message.content;

      PLAPI.logService.info(`End try. ${paperEntity.title}`, "", true, this.id);

      if (summary) {
        if (useMarkdown) {
          if (paperEntity.note === "") {
            summary = "<md>\n## AI Summary \n\n" + summary;
          } else {
            if (paperEntity.note.startsWith("<md>")) {
              summary = "\n\n## AI Summary \n\n" + summary;
            } else {
              paperEntity.note =
                "<md>\n" +
                paperEntity.note +
                "\n\n## AI Summary \n\n" +
                summary;
            }
          }
        } else {
          if (paperEntity.note === "") {
            summary = "AI Summary: " + summary;
          } else {
            summary = "\n\nAI Summary: " + summary;
          }
        }
        paperEntity.note = paperEntity.note + summary;
        await PLAPI.paperService.update([paperEntity], false, true);
      } else {
        PLAPI.logService.warn("Summary is empty.", "", true, this.id);
      }
    } catch (error) {
      PLAPI.logService.error(
        "Failed to summarize the selected paper.",
        error as Error,
        false,
        this.id,
      );
    } finally {
      await PLAPI.uiStateService.setState({
        "processingState.general":
          parseInt(
            (await PLAPI.uiStateService.getState(
              "processingState.general",
            )) as string,
          ) - 1,
      });
    }
  }
}

async function initialize() {
  const extension = new PaperlibExtension();
  await extension.initialize();

  return extension;
}

export { initialize };
