import { requireAccount } from "../shared/auth.js";
import { runAction } from "../shared/api.js";
import { revealPage, showToast } from "../shared/ui.js";

const context = await requireAccount();
if (!context) throw new Error("Authentication required");
const { account, session, supabase } = context;
const form = document.querySelector("#profileForm");

account.categories.forEach((interest) =>
  document.querySelector("#primaryInterest").add(new Option(interest)),
);
if (account.profile) {
  for (const field of ["name", "uni", "level", "graduation", "interest", "bio"])
    form.elements[field].value = account.profile[field] || "";
  if (account.profile.photo) {
    document.querySelector("#avatarPreview").src = account.profile.photo;
    document.querySelector("#avatarPreview").hidden = false;
    document.querySelector("#avatarPlaceholder").hidden = true;
  }
} else form.elements.graduation.value = "2027-04";
revealPage();

document.querySelector("#photo").onchange = (event) => {
  const file = event.target.files[0];
  if (!file || file.size > 2e6)
    return file && showToast("Choose a photo smaller than 2 MB.");
  document.querySelector("#avatarPreview").src = URL.createObjectURL(file);
  document.querySelector("#avatarPreview").hidden = false;
  document.querySelector("#avatarPlaceholder").hidden = true;
};

form.onsubmit = async (event) => {
  event.preventDefault();
  const profile = Object.fromEntries(new FormData(form));
  profile.photo = account.profile?.photo || null;
  try {
    const file = document.querySelector("#photo").files[0];
    if (file) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new Error("Choose a JPG, PNG or WebP photo.");
      const path = `${session.user.id}/avatar`;
      const { error } = await supabase.storage
        .from("profile-photos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      profile.photo = `${supabase.storage.from("profile-photos").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    }
    await runAction("profile", profile);
    window.location.assign("/interests");
  } catch (error) {
    showToast(error.message);
  }
};
