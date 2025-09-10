(function() {
  async function insertFileMenuItems() {
    const getMenuUl = () =>
      document.querySelector(
        "#cheerpjDisplay>.window>div.menuBar>.menu>.menuItem:nth-child(1)>ul"
      );
    if (!window.ij || !getMenuUl()) {
      setTimeout(insertFileMenuItems, 300);
      return;
    }
    const ij = window.ij;
    try {
      let menuUl = getMenuUl();
      if (!menuUl) return;
      const labels = Array.from(menuUl.children).map(
        (li) =>
          (li.querySelector("a") && li.querySelector("a").textContent) || ""
      );

      // Helpers
      const ensureExtension = (name, ext) => {
        if (!name) return `image${ext}`;
        const i = name.lastIndexOf(".");
        if (i > 0) return name.substring(0, i) + ext;
        return name + ext;
      };
      const pngBytesToJpegBlob = (arrayBuffer, quality = 0.9, bg = "#ffffff") =>
        new Promise((resolve, reject) => {
          try {
            const img = new Image();
            const url = URL.createObjectURL(new Blob([arrayBuffer], { type: "image/png" }));
            img.onload = () => {
              try {
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = bg;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(
                  (blob) => {
                    URL.revokeObjectURL(url);
                    if (!blob) return reject(new Error("Failed to create JPEG blob"));
                    resolve(blob);
                  },
                  "image/jpeg",
                  quality
                );
              } catch (e) {
                URL.revokeObjectURL(url);
                reject(e);
              }
            };
            img.onerror = (e) => {
              URL.revokeObjectURL(url);
              reject(e);
            };
            img.src = url;
          } catch (e) {
            reject(e);
          }
        });

      // Add: Save to Figlinq (submenu)
      if (!labels.includes("Save to Figlinq")) {
        const liSave = document.createElement("li");
        liSave.classList.add("menuItem", "subMenuItem");

        const aSave = document.createElement("a");
        aSave.textContent = "Save to Figlinq";
        liSave.appendChild(aSave);

        const arrow = document.createElement("span");
        arrow.classList.add("arrow");
        arrow.textContent = "▶";
        liSave.appendChild(arrow);

        const ulSub = document.createElement("ul");
        ulSub.classList.add("subMenu");

        // Subitem: Save as .png
        const liPng = document.createElement("li");
        liPng.classList.add("menuItem");
        const aPng = document.createElement("a");
        aPng.textContent = "Save as .png";
        liPng.appendChild(aPng);
        liPng.onclick = async (ev) => {
          ev.stopPropagation();
          try {
            const imp = await ij.getImage();
            if (!imp) throw new Error("No active image");
            const baseName = cjStringJavaToJs(await cjCall(imp, "getTitle"));
            const filename = ensureExtension(baseName, ".png");
            const javaBytes = await ij.saveAsBytes(imp, "png");
            const arrayBuffer = javaBytes.slice(1).buffer;
            const blob = new Blob([arrayBuffer], { type: "image/png" });

            const handleFiglinqSaveMessage = (event) => {
              if (
                event.data &&
                (event.data.type === "figlinq-file-saved" ||
                  event.data.type === "figlinq-save-cancelled")
              ) {
                window.removeEventListener("message", handleFiglinqSaveMessage);
              }
            };
            window.addEventListener("message", handleFiglinqSaveMessage);
            window.parent.postMessage(
              {
                action: "upload-file",
                filename,
                imageData: blob,
                imageType: "image/png",
              },
              "*"
            );
          } catch (error) {
            console.error("Failed to save image to Figlinq:", error);
          }
        };

        // Subitem: Save as jpg (90% compression)
        const liJpg = document.createElement("li");
        liJpg.classList.add("menuItem");
        const aJpg = document.createElement("a");
        aJpg.textContent = "Save as jpg (90% compression)";
        liJpg.appendChild(aJpg);
        liJpg.onclick = async (ev) => {
          ev.stopPropagation();
          try {
            const imp = await ij.getImage();
            if (!imp) throw new Error("No active image");
            const baseName = cjStringJavaToJs(await cjCall(imp, "getTitle"));
            const filename = ensureExtension(baseName, ".jpg");

            // Get PNG bytes then convert to JPEG at 90%
            const javaBytes = await ij.saveAsBytes(imp, "png");
            const arrayBuffer = javaBytes.slice(1).buffer;
            const jpegBlob = await pngBytesToJpegBlob(arrayBuffer, 0.9);

            const handleFiglinqSaveMessage = (event) => {
              if (
                event.data &&
                (event.data.type === "figlinq-file-saved" ||
                  event.data.type === "figlinq-save-cancelled")
              ) {
                window.removeEventListener("message", handleFiglinqSaveMessage);
              }
            };
            window.addEventListener("message", handleFiglinqSaveMessage);
            window.parent.postMessage(
              {
                action: "upload-file",
                filename,
                imageData: jpegBlob,
                imageType: "image/jpeg",
              },
              "*"
            );
          } catch (error) {
            console.error("Failed to save image to Figlinq:", error);
          }
        };

        ulSub.appendChild(liPng);
        ulSub.appendChild(liJpg);
        liSave.appendChild(ulSub);

        menuUl.insertBefore(liSave, menuUl.firstChild);
      }

      // Add: Load image from Figlinq
      if (!labels.includes("Load image from Figlinq")) {
        const liLoad = document.createElement("li");
        liLoad.classList.add("menuItem", "subMenuItem");
        const aLoad = document.createElement("a");
        aLoad.textContent = "Load image from Figlinq";
        liLoad.appendChild(aLoad);
        liLoad.onclick = async () => {
          const handleFiglinqMessage = async (event) => {
            if (event.data && event.data.type === "selected-figlinq-file") {
              window.removeEventListener("message", handleFiglinqMessage);
              const file = event.data.file;
              if (!file) return; // user cancelled
              try {
                const name = file.name || "image";
                const filepath = "/str/" + name;
                const buffer = await (file.arrayBuffer
                  ? file.arrayBuffer()
                  : new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result);
                      reader.onerror = reject;
                      reader.readAsArrayBuffer(file);
                    }));
                cheerpjAddStringFile(filepath, new Uint8Array(buffer));
                await ij.open(filepath).finally(() => {
                  try {
                    cheerpjRemoveStringFile(filepath);
                  } catch (e) {
                    /* noop */
                  }
                });
              } catch (e) {
                console.error("Failed to load selected Figlinq file:", e);
              }
            }
          };
          window.addEventListener("message", handleFiglinqMessage);
          window.parent.postMessage({ action: "select-figlinq-file" }, "*");
        };
        menuUl.insertBefore(liLoad, menuUl.firstChild);
      }

      // Add '-' separator (after the two inserted items)
      menuUl = getMenuUl();
      if (menuUl && menuUl.children.length >= 2) {
        const liSep = document.createElement("li");
        liSep.classList.add("menuItem");
        const aSep = document.createElement("a");
        aSep.innerHTML = "-";
        liSep.appendChild(aSep);
        // Insert at index 2 to come after our two new items
        menuUl.insertBefore(liSep, menuUl.children[2]);
      }
    } catch (e) {
      console.error("Failed to add Figlinq menu items:", e);
    }
  }
  insertFileMenuItems();
})();
