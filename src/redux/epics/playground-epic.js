import { Observable } from "rxjs";
import { combineEpics } from "redux-observable";
import _ from "lodash";
import FileSaver from "file-saver";

import playgroundActions from "redux/actions/playground-actions";
import downloadActions from "redux/actions/download-actions";

import { FILE } from "config";
import Iota from "services/iota";
import Datamap from "utils/datamap";
import FileProcessor from "utils/file-processor";

const testUpload = (action$, store) => {
  return action$.ofType(playgroundActions.TEST_UPLOAD).mergeMap(action => {
    const file = action.payload;

    const { numberOfChunks, handle, fileName } = FileProcessor.initializeUpload(
      file
    );

    const byteChunks = FileProcessor.createByteChunks(file.size);

    const chunkReads = byteChunks.map(
      byte =>
        new Promise((resolve, reject) => {
          const { chunkIdx, chunkStartingPoint } = byte;
          const blob = file.slice(
            chunkStartingPoint,
            chunkStartingPoint + FILE.CHUNK_BYTE_SIZE + 1
          );
          const reader = FileProcessor.createReader(arrayBuffer => {
            // console.log("SCURRRR: ", arrayBuffer);
            const chunkInTrytes = FileProcessor.chunkToIotaFormat(
              arrayBuffer,
              handle
            );
            resolve(chunkInTrytes);
          });
          reader.readAsArrayBuffer(blob);
        })
    );

    const sanityCheck = new Promise((resolve, reject) => {
      const blob = file.slice(0, file.size);
      const reader = FileProcessor.createReader(arrayBuffer => {
        console.log("UPLOADED ARRAY BUFFER: ", new Uint8Array(arrayBuffer));
        resolve();
      });
      reader.readAsArrayBuffer(blob);
    });

    return Observable.fromPromise(sanityCheck)
      .mergeMap(() => Observable.fromPromise(Promise.all(chunkReads)))
      .map(chunksInTrytes => {
        // console.log("CHUNKS IN TRYTES: ", chunksInTrytes);
        return playgroundActions.testDownloadAction({
          chunksInTrytes,
          handle,
          fileName
        });
      })
      .catch(error => {
        console.log("ERROR: ", error);
        return Observable.empty();
      });
  });
};

const testDownload = (action$, store) => {
  return action$.ofType(playgroundActions.TEST_DOWNLOAD).map(action => {
    const { chunksInTrytes, handle, fileName } = action.payload;
    const decryptedChunks = chunksInTrytes.map(trytes => {
      return FileProcessor.chunkFromIotaFormat(trytes, handle);
    });

    const completeFileArrayBuffer = _.reduce(
      decryptedChunks,
      (ab, chunk) => {
        const appendedArrayBuffer = new Uint8Array(
          ab.byteLength + chunk.byteLength
        );
        appendedArrayBuffer.set(new Uint8Array(ab), 0);
        appendedArrayBuffer.set(new Uint8Array(chunk), ab.byteLength);
        return appendedArrayBuffer.buffer;
      },
      new ArrayBuffer()
    );

    console.log(
      "DOWNLOADED ARRAY BUFFER: ",
      new Uint8Array(completeFileArrayBuffer)
    );
    const blob = new Blob([new Uint8Array(completeFileArrayBuffer)]);
    FileSaver.saveAs(blob, fileName);

    return downloadActions.downloadSuccessAction();
  });
};

export default combineEpics(testUpload, testDownload);
