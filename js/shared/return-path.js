const requestPath = "/request-organization-access";
export function rememberRequestReturn() {
  sessionStorage.setItem("cc_return_to", requestPath);
}
export function authDestination() {
  return new URLSearchParams(location.search).get("next") === requestPath ||
    sessionStorage.getItem("cc_return_to") === requestPath
    ? requestPath
    : "/home";
}
export function finishSetupDestination() {
  const destination = authDestination();
  sessionStorage.removeItem("cc_return_to");
  return destination;
}
