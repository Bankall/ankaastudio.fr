const splitsLines = text => (text ? text.split(/\s*<br\s*\/?>\s*|\n/) : []);

export const Text = ({ children }) => {
	return (
		<>
			{splitsLines(children).map((line, index) => (
				<span key={index}>
					{index > 0 && <br />}
					{line}
				</span>
			))}
		</>
	);
};
