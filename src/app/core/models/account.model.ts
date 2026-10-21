export interface CurrentUserResponse {
  id: string;
  username: string;
  displayName: string;
  isAdministrator: boolean;
  email: string | null;
  avatarUrl: string | null;
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
  version: string;
  description: string | null;
  imageUrl: string | null;
  recipeCount: number;
  id: string;
  name: string;
  role: string;
}
export interface MemberResponse {
  avatarUrl: string | null;
  isPending: boolean;
  userId: string;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
}

export interface CookbookInvitationResponse {
  cookbookVersion: string;
  id: string;
  cookbookId: string;
  cookbookName: string;
  role: string;
  ownerDisplayName: string;
  ownerAvatarUrl: string | null;
  imageUrl: string | null;
}
export interface CookbookMemberInput {
  username: string;
  role: string;
}

export interface CookbookMembersResponse {
  cookbook: CookbookResponse;
  members: MemberResponse[];
}
export interface VersionResponse {
  version: string;
}
