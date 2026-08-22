import type { ColorValue } from "react-native";
import { Text } from "react-native";

/**
 * The Z3 wordmark used in native navigation headers.
 */
export function Z3Wordmark(props: { readonly height: number; readonly color: ColorValue }) {
  return (
    <Text
      accessibilityLabel="Z3"
      style={{ color: props.color, fontSize: props.height, fontWeight: "800", lineHeight: props.height }}
    >
      Z3
    </Text>
  );
}
