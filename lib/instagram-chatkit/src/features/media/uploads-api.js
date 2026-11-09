import { unsupported } from '../shared/response.js';

export class UploadsApi {
  async photo() { return unsupported('uploads.photo'); }
  async video() { return unsupported('uploads.video'); }
  createPhotoRuploadParams() { return unsupported('uploads.createPhotoRuploadParams'); }
  createVideoRuploadParams() { return unsupported('uploads.createVideoRuploadParams'); }
  async configure() { return unsupported('uploads.configure'); }
  async configureVideo() { return unsupported('uploads.configureVideo'); }
  async configurePhoto() { return unsupported('uploads.configurePhoto'); }
}
