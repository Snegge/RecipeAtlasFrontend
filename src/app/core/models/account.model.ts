export interface CurrentUserResponse {
  id: string;
  username: string;
  displayName: string;
  isAdministrator: boolean;
}
export interface AccountResponse extends CurrentUserResponse {
  isActive: boolean;
}
export interface InvitationResponse {
  id: string;
  createdAtUtc: string;
  expiresAtUtc: string;
  status: string;
}
export interface CreatedInvitation {
  invitation: InvitationResponse;
  link: string;
}
export interface InvitationValidity {
  status: string;
  expiresAtUtc: string | null;
}
export interface CookbookResponse {
  id: string;
  name: string;
  role: string;
}
export interface MemberResponse {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
}
