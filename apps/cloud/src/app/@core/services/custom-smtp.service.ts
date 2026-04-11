import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ICustomSmtp, ICustomSmtpFindInput } from '@xpert-ai/contracts';
import { firstValueFrom } from 'rxjs';
import { API_PREFIX } from '@xpert-ai/cloud/state';
import { toParams } from '@xpert-ai/ocap-angular/core';

@Injectable({
	providedIn: 'root'
})
export class CustomSmtpService {
	API_URL = `${API_PREFIX}/smtp`;

	constructor(private http: HttpClient) {}

	saveSMTPSetting(request: ICustomSmtp) {
		return firstValueFrom(
			this.http
			.post<ICustomSmtp>(`${this.API_URL}`, request)
		);
	}

	updateSMTPSetting(id, request: ICustomSmtp) {
		return firstValueFrom(
			this.http
			.put<ICustomSmtp>(`${this.API_URL}/${id}`, request)
		);
	}

	getSMTPSetting(request: ICustomSmtpFindInput) {
		return firstValueFrom(
			this.http
			.get<ICustomSmtp>(`${this.API_URL}/setting`, {
				params: toParams(request)
			})
		);
	}

	validateSMTPSetting(request: ICustomSmtp) {
		return firstValueFrom(
			this.http
			.post<boolean>(`${this.API_URL}/validate`, request)
		);
	}
}
