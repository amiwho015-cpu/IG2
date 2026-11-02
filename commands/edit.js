/**
 * File Name: edit.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

/*
 * ==========================================
 * Tanvir143 AI Image Editor
 * ==========================================
 */

const tanvirBot = axios;

const tanvir143Module = {
  author: "Tanvir143",
  name: "tanvir143Module",
  bot: "tanvirBot",
  igBot: "tanvir143igBot",
  reelModule: "tanvirReelDownload"
};

const tanvir143 = {
  MAX_INPUT_IMAGE_SIZE: 15 * 1024 * 1024,   // 15 MB
  MAX_OUTPUT_IMAGE_SIZE: 25 * 1024 * 1024,  // 25 MB
  API_TIMEOUT: 120 * 1000,                    // 120 sec
  DOWNLOAD_TIMEOUT: 60 * 1000,               // 60 sec
  CLEANUP_DELAY: 15 * 1000,                   // 15 sec
  MAX_PROMPT_LENGTH: 1000,

  CACHE_DIR: path.join(
    __dirname,
    "cache",
    "edit"
  ),

  API_URL:
    "https://ahm7xmakki.com/api/pti"
};

const tanvirRobot = {
  owner: tanvir143Module.author,
  module: tanvir143Module.name,
  bot: tanvir143Module.bot,
  imageEditor: "tanvir143 AI Image Editor",
  instagramModule: tanvir143Module.igBot,
  downloaderModule: tanvir143Module.reelModule
};


/**
 * ==========================================
 * Safe Reply
 * ==========================================
 */
async function tanvir143SafeReply(
  message,
  payload
) {
  try {
    return await message.reply(payload);
  } catch (error) {
    console.error(
      `[${tanvirRobot.owner}] Reply failed:`,
      error?.message || error
    );

    return null;
  }
}


/**
 * ==========================================
 * Safe Reaction
 * ==========================================
 */
async function tanvir143SafeReact(
  message,
  emoji
) {
  try {
    await message.react(emoji);
    return true;
  } catch (error) {
    console.error(
      `[${tanvirRobot.owner}] Reaction ${emoji} failed:`,
      error?.message || error
    );

    return false;
  }
}


/**
 * ==========================================
 * Safe Unsend
 * ==========================================
 */
async function tanvir143SafeUnsend(
  message,
  messageID
) {
  if (
    !messageID ||
    typeof message.unsend !== "function"
  ) {
    return false;
  }

  try {
    await message.unsend(messageID);
    return true;
  } catch (error) {
    console.error(
      `[${tanvirRobot.owner}] Unsend failed:`,
      error?.message || error
    );

    return false;
  }
}


/**
 * ==========================================
 * Timeout Wrapper
 * ==========================================
 */
function tanvir143Timeout(
  promise,
  ms,
  label = "Operation"
) {
  let timer;

  const timeoutPromise = new Promise(
    (_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `${label} timed out.`
          )
        );
      }, ms);
    }
  );

  return Promise.race([
    Promise.resolve(promise),
    timeoutPromise
  ]).finally(() => {
    clearTimeout(timer);
  });
}


/**
 * ==========================================
 * Normalize Image URL
 * ==========================================
 */
function tanvir143NormalizeImageURL(
  input
) {
  const tanvir143URL =
    String(input || "").trim();

  if (!tanvir143URL) {
    throw new Error(
      "Image URL was not found."
    );
  }

  let tanvir143ParsedURL;

  try {
    tanvir143ParsedURL =
      new URL(tanvir143URL);
  } catch {
    throw new Error(
      "Invalid image URL."
    );
  }

  if (
    tanvir143ParsedURL.protocol !==
      "http:" &&
    tanvir143ParsedURL.protocol !==
      "https:"
  ) {
    throw new Error(
      "Invalid image URL protocol."
    );
  }

  return tanvir143ParsedURL.toString();
}


/**
 * ==========================================
 * Validate Prompt
 * ==========================================
 */
function tanvir143ValidatePrompt(
  input
) {
  const tanvir143Prompt =
    String(input || "")
      .trim()
      .replace(/\s+/g, " ");

  if (!tanvir143Prompt) {
    throw new Error(
      "Please provide an image editing prompt."
    );
  }

  if (
    tanvir143Prompt.length >
    tanvir143.MAX_PROMPT_LENGTH
  ) {
    throw new Error(
      `Prompt is too long. Maximum ${tanvir143.MAX_PROMPT_LENGTH} characters allowed.`
    );
  }

  return tanvir143Prompt;
}


/**
 * ==========================================
 * Download Image
 * ==========================================
 */
async function tanvir143DownloadImage(
  imageURL,
  maxSize,
  label
) {
  const tanvir143Response =
    await tanvirBot.get(
      imageURL,
      {
        responseType:
          "arraybuffer",

        timeout:
          tanvir143.DOWNLOAD_TIMEOUT,

        maxContentLength:
          maxSize,

        maxBodyLength:
          maxSize,

        maxRedirects: 5,

        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/131.0.0.0 Safari/537.36",

          "Accept":
            "image/avif,image/webp,image/apng," +
            "image/svg+xml,image/*,*/*;q=0.8"
        },

        validateStatus: status =>
          status >= 200 &&
          status < 300
      }
    );

  const tanvir143ContentType =
    String(
      tanvir143Response
        .headers?.["content-type"] || ""
    ).toLowerCase();

  const tanvir143ContentLength =
    Number(
      tanvir143Response
        .headers?.["content-length"] || 0
    );

  if (
    tanvir143ContentLength >
    maxSize
  ) {
    throw new Error(
      `${label} is too large.`
    );
  }

  if (
    tanvir143ContentType &&
    !tanvir143ContentType.startsWith(
      "image/"
    ) &&
    !tanvir143ContentType.includes(
      "application/octet-stream"
    )
  ) {
    throw new Error(
      `${label} is not a valid image.`
    );
  }

  const tanvir143Buffer =
    Buffer.from(
      tanvir143Response.data
    );

  if (
    !tanvir143Buffer.length
  ) {
    throw new Error(
      `${label} is empty.`
    );
  }

  if (
    tanvir143Buffer.length >
    maxSize
  ) {
    throw new Error(
      `${label} exceeds the allowed size.`
    );
  }

  return tanvir143Buffer;
}


/**
 * ==========================================
 * Extract Result Image URL
 * ==========================================
 */
function tanvir143ExtractImageURL(
  data
) {
  if (!data) {
    return null;
  }

  const possibleURLs = [
    data.imageUrl,
    data.url,
    data.result,
    data.image,
    data.output,
    data.data?.imageUrl,
    data.data?.url,
    data.data?.result,
    data.data?.image
  ];

  const tanvir143ResultURL =
    possibleURLs.find(
      value =>
        typeof value ===
          "string" &&
        value.trim()
    );

  return (
    tanvir143ResultURL
      ? tanvir143ResultURL.trim()
      : null
  );
}


/**
 * ==========================================
 * Main Module
 * ==========================================
 */
module.exports = {

  config: {
    name: "edit",

    aliases: [
      "editimg",
      "aiedit"
    ],

    author: "Tanvir143",

    category: "Users Cmd",

    cooldown: 6,

    role: 0,

    version: "7.0.0",

    description: {
      en:
        "Advanced AI Image to Image editor"
    },

    usage: {
      en:
        "{p}edit <prompt> (Reply to an image)"
    }
  },


  onStart: async function ({
    message,
    event,
    args
  }) {

    let tanvir143WaitMessage = null;
    let tanvir143ImageFile = null;

    try {

      // ========================================
      // 1. Find replied image
      // ========================================

      const tanvir143Reply =
        event?.messageReply;

      const tanvir143Attachments =
        tanvir143Reply?.attachments;

      const tanvir143Image =
        Array.isArray(
          tanvir143Attachments
        )
          ? tanvir143Attachments.find(
              attachment =>
                attachment &&
                (
                  attachment.type ===
                    "photo" ||
                  typeof attachment.url ===
                    "string"
                )
            )
          : null;


      if (
        !tanvir143Image ||
        !tanvir143Image.url
      ) {

        await tanvir143SafeReact(
          message,
          "❌"
        );

        await tanvir143SafeReply(
          message,
          "🌧️ | Please reply to an image!\n\n" +
          "📌 Example:\n" +
          ".edit make it anime style"
        );

        return null;
      }


      // ========================================
      // 2. Validate prompt
      // ========================================

      let tanvir143Prompt;

      try {

        tanvir143Prompt =
          tanvir143ValidatePrompt(
            args.join(" ")
          );

      } catch (promptError) {

        await tanvir143SafeReact(
          message,
          "❌"
        );

        await tanvir143SafeReply(
          message,
          `🌧️ | ${
            promptError?.message ||
            "Invalid prompt."
          }`
        );

        return null;
      }


      // ========================================
      // 3. Normalize image URL
      // ========================================

      const tanvir143SourceURL =
        tanvir143NormalizeImageURL(
          tanvir143Image.url
        );


      // ========================================
      // 4. Loading reaction
      // ========================================

      await tanvir143SafeReact(
        message,
        "⏳"
      );


      // ========================================
      // 5. Loading message
      // ========================================

      tanvir143WaitMessage =
        await tanvir143SafeReply(
          message,
          "🛠️ | Editing Your Image...\n" +
          "⏳ | AI is processing your request."
        );


      // ========================================
      // 6. Ensure cache directory
      // ========================================

      await fs.ensureDir(
        tanvir143.CACHE_DIR
      );


      // ========================================
      // 7. Download source image
      // ========================================

      const tanvir143SourceBuffer =
        await tanvir143DownloadImage(
          tanvir143SourceURL,

          tanvir143.MAX_INPUT_IMAGE_SIZE,

          "Source image"
        );


      // ========================================
      // 8. Convert to Base64
      // ========================================

      const tanvir143Base64Image =
        tanvir143SourceBuffer.toString(
          "base64"
        );

      if (
        !tanvir143Base64Image
      ) {
        throw new Error(
          "Failed to convert source image."
        );
      }


      // ========================================
      // 9. Send to AI API
      // ========================================

      const tanvir143APIResponse =
        await tanvir143Timeout(

          tanvirBot.post(
            tanvir143.API_URL,
            {
              imageBase64:
                tanvir143Base64Image,

              prompt:
                tanvir143Prompt,

              ratio:
                "auto"
            },
            {
              headers: {
                "Content-Type":
                  "application/json",

                "Accept":
                  "application/json"
              },

              timeout:
                tanvir143.API_TIMEOUT,

              maxContentLength:
                5 * 1024 * 1024,

              maxBodyLength:
                20 * 1024 * 1024,

              validateStatus:
                status =>
                  status >= 200 &&
                  status < 300
            }
          ),

          tanvir143.API_TIMEOUT + 5000,

          "AI image editing API"
        );


      // ========================================
      // 10. Validate API response
      // ========================================

      if (
        !tanvir143APIResponse ||
        !tanvir143APIResponse.data
      ) {
        throw new Error(
          "AI API returned an empty response."
        );
      }


      const tanvir143ResultImageURL =
        tanvir143ExtractImageURL(
          tanvir143APIResponse.data
        );


      if (
        !tanvir143ResultImageURL
      ) {
        throw new Error(
          "AI API did not return any image."
        );
      }


      // ========================================
      // 11. Validate result URL
      // ========================================

      const tanvir143OutputURL =
        tanvir143NormalizeImageURL(
          tanvir143ResultImageURL
        );


      // ========================================
      // 12. Download edited image
      // ========================================

      const tanvir143OutputBuffer =
        await tanvir143DownloadImage(
          tanvir143OutputURL,

          tanvir143.MAX_OUTPUT_IMAGE_SIZE,

          "Edited image"
        );


      // ========================================
      // 13. Generate temporary filename
      // ========================================

      const tanvir143FileName =
        `tanvir143-${Date.now()}-edited.png`;

      tanvir143ImageFile =
        path.join(
          tanvir143.CACHE_DIR,
          tanvir143FileName
        );


      // ========================================
      // 14. Write output file
      // ========================================

      await fs.writeFile(
        tanvir143ImageFile,
        tanvir143OutputBuffer
      );


      // ========================================
      // 15. Confirm file exists
      // ========================================

      const tanvir143FileExists =
        await fs.pathExists(
          tanvir143ImageFile
        );

      if (!tanvir143FileExists) {
        throw new Error(
          "Edited image file could not be created."
        );
      }


      // ========================================
      // 16. Remove loading message
      // ========================================

      await tanvir143SafeUnsend(
        message,
        tanvir143WaitMessage?.messageID
      );


      // ========================================
      // 17. Send edited image
      // ========================================

      try {

        await message.reply({
          body:
            "🚀 AI image gen successfull\n" +
            "🤖 Thanks for using Tanvir143 robot",

          attachment:
            fs.createReadStream(
              tanvir143ImageFile
            )
        });

      } catch (sendError) {

        console.error(
          `[${tanvirRobot.owner}] Image send failed:`,
          sendError?.stack ||
          sendError?.message ||
          sendError
        );

        await tanvir143SafeReact(
          message,
          "❌"
        );

        await tanvir143SafeReply(
          message,
          "🌧️ | Image editing completed, " +
          "but I couldn't send the edited image.\n\n" +
          "Please try again."
        );

        return null;
      }


      // ========================================
      // 18. Success reaction
      // ========================================

      await tanvir143SafeReact(
        message,
        "✅"
      );


      // ========================================
      // 19. Schedule cleanup
      // ========================================

      const tanvir143CleanupFile =
        tanvir143ImageFile;

      tanvir143ImageFile = null;

      setTimeout(() => {

        if (
          tanvir143CleanupFile
        ) {
          fs.remove(
            tanvir143CleanupFile
          ).catch(
            cleanupError => {
              console.error(
                `[${tanvirRobot.owner}] Cleanup failed:`,
                cleanupError?.message ||
                cleanupError
              );
            }
          );
        }

      }, tanvir143.CLEANUP_DELAY);


      return null;


    } catch (tanvir143Error) {

      // ========================================
      // GLOBAL ERROR HANDLER
      // ========================================

      console.error(
        `[${tanvirRobot.module}] Edit command error:`,
        tanvir143Error?.stack ||
        tanvir143Error?.message ||
        tanvir143Error
      );


      // ========================================
      // Cleanup temporary image
      // ========================================

      if (
        tanvir143ImageFile
      ) {
        try {
          await fs.remove(
            tanvir143ImageFile
          );
        } catch (cleanupError) {
          console.error(
            `[${tanvirRobot.owner}] Error cleanup failed:`,
            cleanupError?.message ||
            cleanupError
          );
        }
      }


      // ========================================
      // Remove loading message
      // ========================================

      await tanvir143SafeUnsend(
        message,
        tanvir143WaitMessage?.messageID
      );


      // ========================================
      // Failure reaction
      // ========================================

      await tanvir143SafeReact(
        message,
        "❌"
      );


      // ========================================
      // Failure message
      // ========================================

      await tanvir143SafeReply(
        message,

        "🌧️ | Image editing failed.\n\n" +
        `❌ | ${
          tanvir143Error?.message ||
          "Unknown error."
        }\n\n` +
        "💡 | Please try again with a valid " +
        "image and prompt."
      );


      /*
       * IMPORTANT:
       * Never throw the error again.
       * Prevents unhandled rejection / bot crash.
       */

      return null;
    }
  }
};
